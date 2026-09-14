import express from 'express';
import swaggerUi from 'swagger-ui-express';
import priceHistoryRouter from './routes/priceHistory';
import cardSearchRouter from './routes/cardSearch';
import onePieceCardsRouter from './routes/onePieceCards';
import { syncOnePieceData } from './services/onePieceSync';
import setTrackerRouter from './routes/setTracker';
import enhancedPacksRouter from './routes/enhancedPacks';
import marketInsightsRouter from './routes/marketInsights';
import slabInsightsRouter from './routes/slabInsights';
import investmentsRouter from './routes/investments';
import ebayNotificationsRouter from './routes/ebayNotifications';
import dealsRouter from './routes/deals';
import gradingRouter from './routes/grading';
import captureSessionsRouter from './routes/captureSessions';
import tradesRouter from './routes/trades';
import { getDb } from './db/database';
import {
  updatePriceData,
  getRunDate,
  maybeRecoverStalePrices,
  getPriceFreshness,
} from './services/dataFetcher';
import {
  backupDatabaseToCloud,
  getCloudBackupStatus,
  restoreDatabaseFromCloud,
} from './services/cloudBackupService';
import { syncCatalogData, syncJapaneseCatalogData } from './services/catalogSync';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { captureSessionLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';
import { requireAdmin } from './middleware/admin';
import { logger } from './utils/logger';
import { AuthService } from './services/authService';
import { AlertService } from './services/alertService';
import { PortfolioService } from './services/portfolioService';
import { BinderService } from './services/binderService';
import { WatchlistService } from './services/watchlistService';
import { createAuthRouter } from './routes/auth';
import { createAlertsRouter } from './routes/alerts';
import { createPortfolioRouter } from './routes/portfolio';
import { createBinderRouter } from './routes/binders';
import { createWatchlistsRouter } from './routes/watchlists';

export interface AppServices {
  authService: AuthService;
  alertService: AlertService;
  portfolioService: PortfolioService;
  binderService: BinderService;
  watchlistService: WatchlistService;
}

function registerAdminRoutes(app: express.Express): void {
  app.post('/api/update', authenticate, requireAdmin, async (req, res) => {
    try {
      const requested =
        (typeof req.body?.runDate === 'string' && req.body.runDate) ||
        (typeof req.query.date === 'string' && req.query.date) ||
        '';
      const runDate = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : undefined;
      logger.info('Manual price data update requested', { runDate: runDate || getRunDate() });
      const result = await updatePriceData(runDate ? { runDate } : undefined);
      if (result.skipped) {
        const skippedResult = result as { reason?: string };
        res
          .status(409)
          .json({ success: false, message: skippedResult.reason || 'Update already running' });
        return;
      }
      if (result.syncRunId == null) {
        const errorResult = result as { error?: string };
        res
          .status(409)
          .json({ success: false, message: errorResult.error || 'Update failed to start' });
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

  app.post('/api/sync-catalog-ja', authenticate, requireAdmin, async (req, res) => {
    try {
      const full =
        String(req.query.full ?? req.body?.full ?? '').toLowerCase() === '1' ||
        String(req.query.full ?? req.body?.full ?? '').toLowerCase() === 'true' ||
        String(req.query.mode ?? req.body?.mode ?? '').toLowerCase() === 'full';
      const limitRaw = Number(req.query.limit ?? req.body?.limit ?? (full ? 250 : 13));
      const setLimit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), full ? 250 : 80)
        : full
          ? 250
          : 13;
      logger.info('Manual Japanese catalog sync requested', { setLimit, full });
      (async () => {
        try {
          const result = await syncJapaneseCatalogData(setLimit, { priorityOnly: !full });
          logger.info('Manual Japanese catalog sync completed', result);
        } catch (error: any) {
          logger.error('Manual Japanese catalog sync failed', { error: error.message });
        }
      })();
      res.status(202).json({
        success: true,
        message: full
          ? `Full Japanese catalog sync started (up to ${setLimit} sets).`
          : `Japanese catalog sync started (up to ${setLimit} priority sets).`,
      });
    } catch (error: any) {
      logger.error('Error starting Japanese catalog sync', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to start Japanese catalog sync' });
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
}

function registerHealthRoutes(app: express.Express): void {
  app.get('/health', (_req, res) => {
    maybeRecoverStalePrices();
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  app.get('/api/health', async (_req, res) => {
    maybeRecoverStalePrices();
    try {
      const prices = await getPriceFreshness();
      res.json({
        status: prices.stale ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: env.nodeEnv,
        prices,
      });
    } catch (error: any) {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: env.nodeEnv,
        prices: { error: error.message },
      });
    }
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
          portfolio: '/api/portfolio',
          watchlists: '/api/watchlists',
          prices: '/api/prices',
          cards: '/api/cards',
          packs: '/api/packs',
          binders: '/api/binders',
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
        binders: '/api/binders',
        'market-insights': '/api/market-insights',
        status: '/api/status',
        health: '/api/health',
      },
    });
  });
}

export function registerRoutes(app: express.Express, services: AppServices): void {
  const { authService, alertService, portfolioService, binderService, watchlistService } = services;

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info(`API Documentation available at http://${env.host}:${env.port}/api-docs`);

  app.use('/api/auth', createAuthRouter(authService));
  app.use('/api/alerts', createAlertsRouter(alertService));
  app.use('/api/portfolio', createPortfolioRouter(portfolioService));
  app.use('/api/watchlists', createWatchlistsRouter(watchlistService));
  app.use('/api/prices', priceHistoryRouter);
  app.use('/api/cards', setTrackerRouter);
  app.use('/api/cards', cardSearchRouter);
  app.use('/api/cards', onePieceCardsRouter);
  app.use('/api/packs', enhancedPacksRouter);
  app.use('/api/binders', createBinderRouter(binderService));
  app.use('/api/market-insights', marketInsightsRouter);
  app.use('/api/slab-insights', slabInsightsRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/deals', dealsRouter);
  app.use('/api/ebay/marketplace-account-deletion', ebayNotificationsRouter);
  app.use('/api/grading', gradingRouter);
  app.use('/api/trades', tradesRouter);
  app.use('/api/capture-sessions', captureSessionLimiter, captureSessionsRouter);

  registerAdminRoutes(app);
  registerHealthRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
}
