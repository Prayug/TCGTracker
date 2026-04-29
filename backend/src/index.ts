import express from 'express';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import priceHistoryRouter from './routes/priceHistory';
import cardSearchRouter from './routes/cardSearch';
import enhancedPacksRouter from './routes/enhancedPacks';
import { initializeDatabase, getDb } from './db/database';
import { runMigrations } from './db/migrations';
import { updatePriceData } from './services/dataFetcher';
import { backupDatabaseToCloud, getCloudBackupStatus } from './services/cloudBackupService';
import { syncCatalogData } from './services/catalogSync';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { corsMiddleware, securityMiddleware } from './middleware/security';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger, logger } from './utils/logger';
import { AuthService } from './services/authService';
import { AlertService } from './services/alertService';
import { PortfolioService } from './services/portfolioService';
import { createAuthRouter } from './routes/auth';
import { createAlertsRouter } from './routes/alerts';
import { createPortfolioRouter } from './routes/portfolio';

const app = express();
const port = env.port;

// Security middleware
app.use(securityMiddleware());
app.use(corsMiddleware());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Rate limiting
app.use('/api/', apiLimiter);

// Initialize the database and services
logger.info('Initializing database...');
initializeDatabase();
const db = getDb();

// Initialize set code service on startup (before migrations to ensure it's ready)
import { setCodeService } from './services/setCodeService';
logger.info('Initializing set code service...');

// Initialize with retry logic
const initializeSetCodeService = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await setCodeService.initialize();
      logger.info('✅ Set code service initialized successfully');
      return;
    } catch (error) {
      logger.error(`Failed to initialize set code service (attempt ${i + 1}/${retries})`, { 
        error: (error as Error).message 
      });
      if (i < retries - 1) {
        const delay = (i + 1) * 2000; // 2s, 4s, 6s
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  logger.error('❌ CRITICAL: Failed to initialize set code service after all retries. Image loading will be impaired.');
};

initializeSetCodeService();

// Run database migrations before creating services
runMigrations(db)
  .then(() => {
    // Services are created after migrations complete
    const authService = new AuthService(db);
    const alertService = new AlertService(db);
    const portfolioService = new PortfolioService(db);

    // Set up routes after services are ready
    setupRoutes(authService, alertService, portfolioService);
  })
  .catch((error) => {
    logger.error('Failed to run migrations', { error });
    process.exit(1);
  });

// Move route setup to a function that gets called after migrations
function setupRoutes(
  authService: AuthService,
  alertService: AlertService,
  portfolioService: PortfolioService
) {
  // API Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info(`API Documentation available at http://${env.host}:${port}/api-docs`);

  // Schedule daily data updates at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled daily price data update...');
    try {
      const result = await updatePriceData();
      logger.info('Daily price data update completed', result);
    } catch (error: any) {
      logger.error('Failed to update price data', { error: error.message });
    }
  }, {
    timezone: "America/New_York"
  });

  // Sync card catalog metadata shortly before price sync
  cron.schedule('30 1 * * *', async () => {
    logger.info('Running scheduled catalog sync...');
    try {
      const result = await syncCatalogData();
      logger.info('Catalog sync completed', result);
    } catch (error: any) {
      logger.error('Failed to sync card catalog', { error: error.message });
    }
  }, {
    timezone: 'America/New_York',
  });

  // Run initial data update on startup (after a short delay)
  if (env.isProduction) {
    setTimeout(async () => {
      logger.info('Running initial catalog sync...');
      try {
        const catalogResult = await syncCatalogData();
        logger.info('Initial catalog sync completed', catalogResult);
      } catch (error: any) {
        logger.error('Failed initial catalog sync', { error: error.message });
      }

      logger.info('Running initial price data update...');
      try {
        const updateResult = await updatePriceData();
        logger.info('Initial price update completed', updateResult);
      } catch (error: any) {
        logger.error('Failed initial price update', { error: error.message });
      }
    }, 5000);
  }

  // API Routes
  app.use('/api/auth', authLimiter, createAuthRouter(authService));
  app.use('/api/alerts', createAlertsRouter(alertService));
  app.use('/api/portfolio', createPortfolioRouter(portfolioService));
  app.use('/api/prices', priceHistoryRouter);
  app.use('/api/cards', cardSearchRouter);
  app.use('/api/packs', enhancedPacksRouter);

  // Manual update endpoint (admin only in production)
  app.post('/api/update', async (req, res) => {
    try {
      logger.info('Manual price data update requested');
      updatePriceData()
        .then((result) => logger.info('Manual update finished', result))
        .catch((error: any) => logger.error('Manual update failed', { error: error.message }));
      res.status(202).json({ 
        success: true, 
        message: 'Data update process started in background.' 
      });
    } catch (error: any) {
      logger.error('Error starting manual update', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to start update process' 
      });
    }
  });

  app.post('/api/cloud-backup', async (_req, res) => {
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
      res.status(500).json({
        success: false,
        error: 'Cloud backup failed',
      });
    }
  });

  app.get('/api/cloud-backup/status', async (_req, res) => {
    try {
      const status = await getCloudBackupStatus();
      res.json(status);
    } catch (error: any) {
      logger.error('Cloud backup status failed', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve cloud backup status',
      });
    }
  });

  app.post('/api/sync-catalog', async (_req, res) => {
    try {
      logger.info('Manual catalog sync requested');
      syncCatalogData()
        .then((result) => logger.info('Manual catalog sync completed', result))
        .catch((error: any) =>
          logger.error('Manual catalog sync failed', { error: error.message })
        );

      res.status(202).json({
        success: true,
        message: 'Catalog sync started in background.',
      });
    } catch (error: any) {
      logger.error('Error starting manual catalog sync', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to start catalog sync process',
      });
    }
  });

  // Health check endpoint (for Docker)
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: env.nodeEnv
    });
  });

  // Get server status
  app.get('/api/status', async (req, res) => {
    try {
      res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
        version: '1.0.0',
        scheduledTasks: {
          catalogSync: 'Daily at 1:30 AM EST',
          dataUpdate: 'Daily at 2:00 AM EST'
        },
        endpoints: {
          auth: '/api/auth',
          alerts: '/api/alerts',
          prices: '/api/prices',
          cards: '/api/cards',
          packs: '/api/packs',
          docs: '/api-docs',
          health: '/api/health'
        }
      });
    } catch (error: any) {
      logger.error('Error getting status', { error: error.message });
      res.status(500).json({ 
        status: 'error', 
        error: 'Failed to get status' 
      });
    }
  });

  app.get('/', (req, res) => {
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
        status: '/api/status',
        health: '/api/health'
      }
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  app.listen(port, () => {
    logger.info(`🚀 TCGTracker Backend server running on http://${env.host}:${port}`);
    logger.info(`📈 Price data updates scheduled daily at 2:00 AM EST`);
    logger.info(`📚 API documentation available at http://${env.host}:${port}/api-docs`);
    logger.info(`🔒 Security features enabled: Helmet, CORS, Rate Limiting`);
    logger.info(`Environment: ${env.nodeEnv}`);
  });
}
