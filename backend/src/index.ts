import express from 'express';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import priceHistoryRouter from './routes/priceHistory';
import cardSearchRouter from './routes/cardSearch';
import onePieceCardsRouter from './routes/onePieceCards';
import { syncOnePieceData, isOnePieceCatalogIncomplete } from './services/onePieceSync';
import setTrackerRouter from './routes/setTracker';
import enhancedPacksRouter from './routes/enhancedPacks';
import marketInsightsRouter from './routes/marketInsights';
import { initializeDatabase, getDb } from './db/database';
import { runMigrations } from './db/migrations';
import { updatePriceData, getRunDate, hasCompletedPriceUpdateFor } from './services/dataFetcher';
import { backupDatabaseToCloud, getCloudBackupStatus, restoreDatabaseFromCloud } from './services/cloudBackupService';
import { syncCatalogData } from './services/catalogSync';
import { backfillCardMappingImages } from './services/cardImageBackfillService';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { corsMiddleware, securityMiddleware } from './middleware/security';
import { csrfProtection } from './middleware/csrf';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authenticate, AuthRequest } from './middleware/auth';
import { requireAdmin } from './middleware/admin';
import { requestLogger, logger } from './utils/logger';
import { AuthService } from './services/authService';
import { AlertService } from './services/alertService';
import { PortfolioService } from './services/portfolioService';
import { createAuthRouter } from './routes/auth';
import { createAlertsRouter } from './routes/alerts';
import { createPortfolioRouter } from './routes/portfolio';
import { setCodeService } from './services/setCodeService';
import { initSentry } from './config/sentry';

initSentry();

const app = express();
const port = env.port;
const BODY_LIMIT = '1mb';

app.set('trust proxy', 1);

app.use(securityMiddleware());
app.use(corsMiddleware());
app.use(csrfProtection);
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

const REQUEST_TIMEOUT_MS = 120000;
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    logger.warn('Request timed out', { method: req.method, url: req.url });
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timed out' });
    }
  });
  next();
});

app.use(requestLogger);
app.use('/api/', apiLimiter);

let server: ReturnType<typeof app.listen> | null = null;

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

function setupRoutes(
  authService: AuthService,
  alertService: AlertService,
  portfolioService: PortfolioService
) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info(`API Documentation available at http://${env.host}:${port}/api-docs`);

  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('Running scheduled daily price data update...');
      try {
        const result = await updatePriceData();
        if (result.skipped) {
          logger.warn('Daily price data update skipped', { reason: (result as { reason?: string }).reason });
          return;
        }
        logger.info('Daily price data update completed', result);
        const imageResult = await backfillCardMappingImages();
        logger.info('Post-price-update image backfill completed', imageResult);
      } catch (error: any) {
        logger.error('Failed to update price data', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  // Catch-up: node-cron never fires missed jobs (machine asleep at 2 AM ET,
  // process not running, etc.), which silently freezes price data. Check every
  // 30 minutes whether today's price update completed and run it if not.
  const PRICE_CATCHUP_INTERVAL_MS = 30 * 60 * 1000;
  const runPriceUpdateCatchUp = async () => {
    try {
      const today = getRunDate();
      // Before 2 AM ET, today's run isn't due yet — leave it to the cron.
      const etHour = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date()),
        10
      );
      if (etHour < 2) return;
      if (await hasCompletedPriceUpdateFor(today)) return;

      logger.warn('Price update for today has not completed — running catch-up', { runDate: today });
      const result = await updatePriceData();
      if (result.skipped) {
        logger.info('Price update catch-up skipped', { reason: (result as { reason?: string }).reason });
        return;
      }
      logger.info('Price update catch-up completed', result);
      const imageResult = await backfillCardMappingImages();
      logger.info('Post-catch-up image backfill completed', imageResult);
    } catch (error: any) {
      logger.error('Price update catch-up failed', { error: error.message });
    }
  };
  setTimeout(() => void runPriceUpdateCatchUp(), 60_000);
  setInterval(() => void runPriceUpdateCatchUp(), PRICE_CATCHUP_INTERVAL_MS);

  cron.schedule(
    '30 1 * * *',
    async () => {
      logger.info('Running scheduled catalog sync...');
      try {
        const result = await syncCatalogData();
        logger.info('Catalog sync completed', result);
        const imageResult = await backfillCardMappingImages();
        logger.info('Post-catalog image backfill completed', imageResult);
      } catch (error: any) {
        logger.error('Failed to sync card catalog', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  cron.schedule(
    '45 1 * * *',
    async () => {
      logger.info('Running scheduled One Piece catalog and price sync...');
      try {
        const result = await syncOnePieceData();
        logger.info('One Piece sync completed', result);
      } catch (error: any) {
        logger.error('Failed to sync One Piece data', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  app.use('/api/auth', createAuthRouter(authService));
  app.use('/api/alerts', createAlertsRouter(alertService));
  app.use('/api/portfolio', createPortfolioRouter(portfolioService));
  app.use('/api/prices', priceHistoryRouter);
  app.use('/api/cards', setTrackerRouter);
  app.use('/api/cards', cardSearchRouter);
  app.use('/api/cards', onePieceCardsRouter);
  app.use('/api/packs', enhancedPacksRouter);
  app.use('/api/market-insights', marketInsightsRouter);

  cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('Running scheduled prediction run...');
      try {
        const { runPredictions } = await import('./services/predictionEngine');
        const { updateActualResults } = await import('./services/forwardTestTracker');
        await runPredictions();
        await updateActualResults();
        logger.info('Scheduled prediction run completed');
      } catch (error: any) {
        logger.error('Failed to run predictions', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  // Full signal scrape daily at 4:00 AM ET (after price update + prediction run).
  cron.schedule(
    '0 4 * * *',
    async () => {
      logger.info('Running scheduled signal scrape...');
      try {
        const { runSignalScrape } = await import('./services/scrapers/scraperRunner');
        const result = await runSignalScrape();
        logger.info('Scheduled signal scrape completed', result);
      } catch (error: any) {
        logger.error('Failed to run signal scrape', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  // Fast-moving social/video sources refresh every 6 hours.
  cron.schedule(
    '30 */6 * * *',
    async () => {
      logger.info('Running scheduled social signal scrape...');
      try {
        const { runSignalScrape } = await import('./services/scrapers/scraperRunner');
        const result = await runSignalScrape();
        logger.info('Scheduled social signal scrape completed', result);
      } catch (error: any) {
        logger.error('Failed to run social signal scrape', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  // Release-calendar pages change rarely — scrape weekly (Sunday 5:00 AM ET).
  cron.schedule(
    '0 5 * * 0',
    async () => {
      logger.info('Running scheduled weekly signal scrape...');
      try {
        const { runSignalScrape } = await import('./services/scrapers/scraperRunner');
        const result = await runSignalScrape();
        logger.info('Scheduled weekly signal scrape completed', result);
      } catch (error: any) {
        logger.error('Failed to run weekly signal scrape', { error: error.message });
      }
    },
    { timezone: 'America/New_York' }
  );

  app.post('/api/update', authenticate, requireAdmin, async (req, res) => {
    try {
      logger.info('Manual price data update requested');
      const result = await updatePriceData();
      if (result.skipped) {
        const skippedResult = result as { reason?: string };
        res.status(409).json({ success: false, message: skippedResult.reason || 'Update already running' });
        return;
      }
      if (result.syncRunId == null) {
        const errorResult = result as { error?: string };
        res.status(409).json({ success: false, message: errorResult.error || 'Update failed to start' });
        return;
      }
      logger.info('Manual update finished', result);
      const successResult = result as { syncRunId: number; totalPricesProcessed: number };
      res.status(202).json({
        success: true,
        syncRunId: successResult.syncRunId,
        message: `Data update process completed. Prices processed: ${successResult.totalPricesProcessed}`,
      });
    } catch (error: any) {
      logger.error('Error during manual update', { error: error.message });
      res.status(500).json({ success: false, error: 'Update failed' });
    }
  });

  app.get('/api/update/status/:runId', async (req, res) => {
    try {
      const { runId } = req.params;
      const db = getDb();
      db.get(
        `SELECT id, runType, runDate, status, totalPricesProcessed, groupsProcessed, groupsFailed, message, startedAt, completedAt
         FROM sync_runs WHERE id = ?`,
        [runId],
        (err, row: any) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }
          if (!row) {
            res.status(404).json({ error: 'Run not found' });
            return;
          }
          res.json({ data: row });
        }
      );
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/cloud-backup', authenticate, requireAdmin, async (_req, res) => {
    try {
      const runDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const result = await backupDatabaseToCloud(runDate);
      res.status(result.uploaded || !result.enabled ? 200 : 500).json(result);
    } catch (error: any) {
      logger.error('Cloud backup endpoint failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Cloud backup failed' });
    }
  });

  app.get('/api/cloud-backup/status', async (_req, res) => {
    try {
      const status = await getCloudBackupStatus();
      res.json(status);
    } catch (error: any) {
      logger.error('Cloud backup status failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to retrieve cloud backup status' });
    }
  });

  app.post('/api/cloud-backup/restore', authenticate, requireAdmin, async (_req, res) => {
    try {
      const result = await restoreDatabaseFromCloud();
      res.status(result.restored || !result.enabled ? 200 : 500).json(result);
      if (result.restored) {
        logger.warn('Database restored from cloud — server restart recommended');
        setTimeout(() => process.exit(0), 1000);
      }
    } catch (error: any) {
      logger.error('Cloud restore endpoint failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Cloud restore failed' });
    }
  });

  app.post('/api/sync-catalog', authenticate, requireAdmin, async (_req, res) => {
    try {
      logger.info('Manual catalog sync requested');
      (async () => {
        try {
          const result = await syncCatalogData();
          logger.info('Manual catalog sync completed', result);
        } catch (error: any) {
          logger.error('Manual catalog sync failed', { error: error.message });
        }
      })();
      res.status(202).json({ success: true, message: 'Catalog sync started in background.' });
    } catch (error: any) {
      logger.error('Error starting manual catalog sync', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to start catalog sync process' });
    }
  });

  app.post('/api/sync-onepiece', authenticate, requireAdmin, async (_req, res) => {
    try {
      logger.info('Manual One Piece sync requested');
      (async () => {
        try {
          const result = await syncOnePieceData();
          logger.info('Manual One Piece sync completed', result);
        } catch (error: any) {
          logger.error('Manual One Piece sync failed', { error: error.message });
        }
      })();
      res.status(202).json({ success: true, message: 'One Piece sync started in background.' });
    } catch (error: any) {
      logger.error('Error starting manual One Piece sync', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to start One Piece sync process' });
    }
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: env.nodeEnv,
    });
  });

  app.get('/api/status', async (_req, res) => {
    try {
      res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
        version: '1.0.0',
        scheduledTasks: {
          catalogSync: 'Daily at 1:30 AM EST',
          onePieceSync: 'Daily at 1:45 AM EST',
          dataUpdate: 'Daily at 2:00 AM EST',
          predictions: 'Daily at 3:00 AM EST',
          signalScrape: 'Daily at 4:00 AM EST (social sources every 6 hours)',
        },
        endpoints: {
          auth: '/api/auth',
          alerts: '/api/alerts',
          prices: '/api/prices',
          cards: '/api/cards',
          packs: '/api/packs',
          'market-insights': '/api/market-insights',
          docs: '/api-docs',
          health: '/api/health',
        },
      });
    } catch (error: any) {
      logger.error('Error getting status', { error: error.message });
      res.status(500).json({ status: 'error', error: 'Failed to get status' });
    }
  });

  app.get('/', (_req, res) => {
    res.json({
      message: 'TCGTracker Backend API',
      version: '1.0.0',
      documentation: '/api-docs',
      endpoints: {
        auth: '/api/auth',
        alerts: '/api/alerts',
        prices: '/api/prices',
        cards: '/api/cards',
        packs: '/api/packs',
        'market-insights': '/api/market-insights',
        status: '/api/status',
        health: '/api/health',
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  server = app.listen(port, () => {
    logger.info(`TCGTracker Backend server running on http://${env.host}:${port}`);
    logger.info(`Price data updates scheduled daily at 2:00 AM EST`);
    logger.info(`API documentation available at http://${env.host}:${port}/api-docs`);
    logger.info(`Environment: ${env.nodeEnv}`);
  });
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

    await Promise.all([
      authService.init(),
      alertService.init(),
    ]);

    setupRoutes(authService, alertService, portfolioService);

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
        logger.warn('Startup image backfill failed (non-fatal)', { error: (error as Error).message });
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
        logger.warn('One Piece catalog check / sync failed (non-fatal)', { error: (error as Error).message });
      }
    })();
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap();

export default app;
