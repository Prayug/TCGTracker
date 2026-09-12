import { initSentry } from './config/sentry';
import { createApp } from './app';
import { registerRoutes } from './routes';
import { setupScheduledJobs } from './jobs';
import { startServer, shutdown } from './server';
import { initializeDatabase, getDb } from './db/database';
import { runMigrations } from './db/migrations';
import { failStalePriceUpdateRuns } from './services/dataFetcher';
import { backfillCardMappingImages } from './services/cardImageBackfillService';
import { isOnePieceCatalogIncomplete, syncOnePieceData } from './services/onePieceSync';
import { AuthService } from './services/authService';
import { AlertService } from './services/alertService';
import { PortfolioService } from './services/portfolioService';
import { BinderService } from './services/binderService';
import { WatchlistService } from './services/watchlistService';
import { setCodeService } from './services/setCodeService';
import { logger } from './utils/logger';

initSentry();

const app = createApp();

async function initializeSetCodeService(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await setCodeService.initialize();
      logger.info('Set code service initialized successfully');
      return;
    } catch (error) {
      logger.error(`Failed to initialize set code service (attempt ${i + 1}/${retries})`, {
        error: (error as Error).message,
      });
      if (i < retries - 1) {
        const delay = (i + 1) * 2000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  logger.error('CRITICAL: Failed to initialize set code service after all retries.');
}

async function bootstrap() {
  try {
    logger.info('Initializing database...');
    await initializeDatabase();
    const db = getDb();
    await runMigrations(db);

    const authService = new AuthService(db);
    const alertService = new AlertService(db);
    const portfolioService = new PortfolioService(db);
    const binderService = new BinderService(db);
    const watchlistService = new WatchlistService(db);

    await Promise.all([authService.init(), alertService.init(), watchlistService.ensureSchema()]);

    registerRoutes(app, {
      authService,
      alertService,
      portfolioService,
      binderService,
      watchlistService,
    });
    setupScheduledJobs(alertService);
    startServer(app);

    void failStalePriceUpdateRuns()
      .then((n) => {
        if (n > 0) logger.warn('Marked stale price_update runs as failed', { count: n });
      })
      .catch((error) => {
        logger.warn('Could not clear stale price_update runs', { error: (error as Error).message });
      });

    void initializeSetCodeService().catch((error) => {
      logger.error('Background set code service initialization failed', {
        error: (error as Error).message,
      });
    });

    (async () => {
      await new Promise((r) => setTimeout(r, 15_000));
      try {
        const result = await backfillCardMappingImages();
        logger.info('Startup image backfill completed', result);
      } catch (error) {
        logger.warn('Startup image backfill failed (non-fatal)', {
          error: (error as Error).message,
        });
      }
    })();

    (async () => {
      await new Promise((r) => setTimeout(r, 20_000));
      try {
        const incomplete = await isOnePieceCatalogIncomplete();
        if (incomplete) {
          logger.info('One Piece catalog incomplete — running sync in background');
          const result = await syncOnePieceData();
          logger.info('One Piece sync completed', result);
        }
      } catch (error) {
        logger.warn('One Piece catalog check / sync failed (non-fatal)', {
          error: (error as Error).message,
        });
      }
    })();
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap();

export default app;
