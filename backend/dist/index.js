"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const node_cron_1 = __importDefault(require("node-cron"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const priceHistory_1 = __importDefault(require("./routes/priceHistory"));
const cardSearch_1 = __importDefault(require("./routes/cardSearch"));
const onePieceCards_1 = __importDefault(require("./routes/onePieceCards"));
const onePieceSync_1 = require("./services/onePieceSync");
const setTracker_1 = __importDefault(require("./routes/setTracker"));
const enhancedPacks_1 = __importDefault(require("./routes/enhancedPacks"));
const marketInsights_1 = __importDefault(require("./routes/marketInsights"));
const database_1 = require("./db/database");
const migrations_1 = require("./db/migrations");
const dataFetcher_1 = require("./services/dataFetcher");
const cloudBackupService_1 = require("./services/cloudBackupService");
const catalogSync_1 = require("./services/catalogSync");
const cardImageBackfillService_1 = require("./services/cardImageBackfillService");
const env_1 = require("./config/env");
const swagger_1 = require("./config/swagger");
const security_1 = require("./middleware/security");
const csrf_1 = require("./middleware/csrf");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./middleware/auth");
const admin_1 = require("./middleware/admin");
const logger_1 = require("./utils/logger");
const authService_1 = require("./services/authService");
const alertService_1 = require("./services/alertService");
const portfolioService_1 = require("./services/portfolioService");
const auth_2 = require("./routes/auth");
const alerts_1 = require("./routes/alerts");
const portfolio_1 = require("./routes/portfolio");
const setCodeService_1 = require("./services/setCodeService");
const sentry_1 = require("./config/sentry");
(0, sentry_1.initSentry)();
const app = (0, express_1.default)();
const port = env_1.env.port;
const BODY_LIMIT = '1mb';
app.set('trust proxy', 1);
app.use((0, security_1.securityMiddleware)());
app.use((0, security_1.corsMiddleware)());
app.use(csrf_1.csrfProtection);
app.use(express_1.default.json({ limit: BODY_LIMIT }));
app.use(express_1.default.urlencoded({ extended: true, limit: BODY_LIMIT }));
const REQUEST_TIMEOUT_MS = 120000;
app.use((req, res, next) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
        logger_1.logger.warn('Request timed out', { method: req.method, url: req.url });
        if (!res.headersSent) {
            res.status(503).json({ error: 'Request timed out' });
        }
    });
    next();
});
app.use(logger_1.requestLogger);
app.use('/api/', rateLimiter_1.apiLimiter);
let server = null;
async function initializeSetCodeService(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await setCodeService_1.setCodeService.initialize();
            logger_1.logger.info('Set code service initialized successfully');
            return;
        }
        catch (error) {
            logger_1.logger.error(`Failed to initialize set code service (attempt ${i + 1}/${retries})`, {
                error: error.message,
            });
            if (i < retries - 1) {
                const delay = (i + 1) * 2000;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    logger_1.logger.error('CRITICAL: Failed to initialize set code service after all retries.');
}
function setupRoutes(authService, alertService, portfolioService) {
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
    logger_1.logger.info(`API Documentation available at http://${env_1.env.host}:${port}/api-docs`);
    node_cron_1.default.schedule('0 2 * * *', async () => {
        logger_1.logger.info('Running scheduled daily price data update...');
        try {
            const result = await (0, dataFetcher_1.updatePriceData)();
            if (result.skipped) {
                logger_1.logger.warn('Daily price data update skipped', { reason: result.reason });
                return;
            }
            logger_1.logger.info('Daily price data update completed', result);
            const imageResult = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
            logger_1.logger.info('Post-price-update image backfill completed', imageResult);
        }
        catch (error) {
            logger_1.logger.error('Failed to update price data', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    // Catch-up: node-cron never fires missed jobs (machine asleep at 2 AM ET,
    // process not running, etc.), which silently freezes price data. Check every
    // 30 minutes whether today's price update completed and run it if not.
    const PRICE_CATCHUP_INTERVAL_MS = 30 * 60 * 1000;
    const runPriceUpdateCatchUp = async () => {
        try {
            const today = (0, dataFetcher_1.getRunDate)();
            // Before 2 AM ET, today's run isn't due yet — leave it to the cron.
            const etHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(new Date()), 10);
            if (etHour < 2)
                return;
            if (await (0, dataFetcher_1.hasCompletedPriceUpdateFor)(today))
                return;
            logger_1.logger.warn('Price update for today has not completed — running catch-up', { runDate: today });
            const result = await (0, dataFetcher_1.updatePriceData)();
            if (result.skipped) {
                logger_1.logger.info('Price update catch-up skipped', { reason: result.reason });
                return;
            }
            logger_1.logger.info('Price update catch-up completed', result);
            const imageResult = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
            logger_1.logger.info('Post-catch-up image backfill completed', imageResult);
        }
        catch (error) {
            logger_1.logger.error('Price update catch-up failed', { error: error.message });
        }
    };
    setTimeout(() => void runPriceUpdateCatchUp(), 60000);
    setInterval(() => void runPriceUpdateCatchUp(), PRICE_CATCHUP_INTERVAL_MS);
    node_cron_1.default.schedule('30 1 * * *', async () => {
        logger_1.logger.info('Running scheduled catalog sync...');
        try {
            const result = await (0, catalogSync_1.syncCatalogData)();
            logger_1.logger.info('Catalog sync completed', result);
            const imageResult = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
            logger_1.logger.info('Post-catalog image backfill completed', imageResult);
        }
        catch (error) {
            logger_1.logger.error('Failed to sync card catalog', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('45 1 * * *', async () => {
        logger_1.logger.info('Running scheduled One Piece catalog and price sync...');
        try {
            const result = await (0, onePieceSync_1.syncOnePieceData)();
            logger_1.logger.info('One Piece sync completed', result);
        }
        catch (error) {
            logger_1.logger.error('Failed to sync One Piece data', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    app.use('/api/auth', (0, auth_2.createAuthRouter)(authService));
    app.use('/api/alerts', (0, alerts_1.createAlertsRouter)(alertService));
    app.use('/api/portfolio', (0, portfolio_1.createPortfolioRouter)(portfolioService));
    app.use('/api/prices', priceHistory_1.default);
    app.use('/api/cards', setTracker_1.default);
    app.use('/api/cards', cardSearch_1.default);
    app.use('/api/cards', onePieceCards_1.default);
    app.use('/api/packs', enhancedPacks_1.default);
    app.use('/api/market-insights', marketInsights_1.default);
    node_cron_1.default.schedule('0 3 * * *', async () => {
        logger_1.logger.info('Running scheduled prediction run...');
        try {
            const { runPredictions } = await Promise.resolve().then(() => __importStar(require('./services/predictionEngine')));
            const { updateActualResults } = await Promise.resolve().then(() => __importStar(require('./services/forwardTestTracker')));
            await runPredictions();
            await updateActualResults();
            logger_1.logger.info('Scheduled prediction run completed');
        }
        catch (error) {
            logger_1.logger.error('Failed to run predictions', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    // Full signal scrape daily at 4:00 AM ET (after price update + prediction run).
    node_cron_1.default.schedule('0 4 * * *', async () => {
        logger_1.logger.info('Running scheduled signal scrape...');
        try {
            const { runSignalScrape } = await Promise.resolve().then(() => __importStar(require('./services/scrapers/scraperRunner')));
            const result = await runSignalScrape();
            logger_1.logger.info('Scheduled signal scrape completed', result);
        }
        catch (error) {
            logger_1.logger.error('Failed to run signal scrape', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    // Fast-moving social/video sources refresh every 6 hours.
    node_cron_1.default.schedule('30 */6 * * *', async () => {
        logger_1.logger.info('Running scheduled social signal scrape...');
        try {
            const { runSignalScrape } = await Promise.resolve().then(() => __importStar(require('./services/scrapers/scraperRunner')));
            const result = await runSignalScrape();
            logger_1.logger.info('Scheduled social signal scrape completed', result);
        }
        catch (error) {
            logger_1.logger.error('Failed to run social signal scrape', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    // Release-calendar pages change rarely — scrape weekly (Sunday 5:00 AM ET).
    node_cron_1.default.schedule('0 5 * * 0', async () => {
        logger_1.logger.info('Running scheduled weekly signal scrape...');
        try {
            const { runSignalScrape } = await Promise.resolve().then(() => __importStar(require('./services/scrapers/scraperRunner')));
            const result = await runSignalScrape();
            logger_1.logger.info('Scheduled weekly signal scrape completed', result);
        }
        catch (error) {
            logger_1.logger.error('Failed to run weekly signal scrape', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    app.post('/api/update', auth_1.authenticate, admin_1.requireAdmin, async (req, res) => {
        try {
            logger_1.logger.info('Manual price data update requested');
            const result = await (0, dataFetcher_1.updatePriceData)();
            if (result.skipped) {
                const skippedResult = result;
                res.status(409).json({ success: false, message: skippedResult.reason || 'Update already running' });
                return;
            }
            if (result.syncRunId == null) {
                const errorResult = result;
                res.status(409).json({ success: false, message: errorResult.error || 'Update failed to start' });
                return;
            }
            logger_1.logger.info('Manual update finished', result);
            const successResult = result;
            res.status(202).json({
                success: true,
                syncRunId: successResult.syncRunId,
                message: `Data update process completed. Prices processed: ${successResult.totalPricesProcessed}`,
            });
        }
        catch (error) {
            logger_1.logger.error('Error during manual update', { error: error.message });
            res.status(500).json({ success: false, error: 'Update failed' });
        }
    });
    app.get('/api/update/status/:runId', async (req, res) => {
        try {
            const { runId } = req.params;
            const db = (0, database_1.getDb)();
            db.get(`SELECT id, runType, runDate, status, totalPricesProcessed, groupsProcessed, groupsFailed, message, startedAt, completedAt
         FROM sync_runs WHERE id = ?`, [runId], (err, row) => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                if (!row) {
                    res.status(404).json({ error: 'Run not found' });
                    return;
                }
                res.json({ data: row });
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    app.post('/api/cloud-backup', auth_1.authenticate, admin_1.requireAdmin, async (_req, res) => {
        try {
            const runDate = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(new Date());
            const result = await (0, cloudBackupService_1.backupDatabaseToCloud)(runDate);
            res.status(result.uploaded || !result.enabled ? 200 : 500).json(result);
        }
        catch (error) {
            logger_1.logger.error('Cloud backup endpoint failed', { error: error.message });
            res.status(500).json({ success: false, error: 'Cloud backup failed' });
        }
    });
    app.get('/api/cloud-backup/status', async (_req, res) => {
        try {
            const status = await (0, cloudBackupService_1.getCloudBackupStatus)();
            res.json(status);
        }
        catch (error) {
            logger_1.logger.error('Cloud backup status failed', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to retrieve cloud backup status' });
        }
    });
    app.post('/api/cloud-backup/restore', auth_1.authenticate, admin_1.requireAdmin, async (_req, res) => {
        try {
            const result = await (0, cloudBackupService_1.restoreDatabaseFromCloud)();
            res.status(result.restored || !result.enabled ? 200 : 500).json(result);
            if (result.restored) {
                logger_1.logger.warn('Database restored from cloud — server restart recommended');
                setTimeout(() => process.exit(0), 1000);
            }
        }
        catch (error) {
            logger_1.logger.error('Cloud restore endpoint failed', { error: error.message });
            res.status(500).json({ success: false, error: 'Cloud restore failed' });
        }
    });
    app.post('/api/sync-catalog', auth_1.authenticate, admin_1.requireAdmin, async (_req, res) => {
        try {
            logger_1.logger.info('Manual catalog sync requested');
            (async () => {
                try {
                    const result = await (0, catalogSync_1.syncCatalogData)();
                    logger_1.logger.info('Manual catalog sync completed', result);
                }
                catch (error) {
                    logger_1.logger.error('Manual catalog sync failed', { error: error.message });
                }
            })();
            res.status(202).json({ success: true, message: 'Catalog sync started in background.' });
        }
        catch (error) {
            logger_1.logger.error('Error starting manual catalog sync', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to start catalog sync process' });
        }
    });
    app.post('/api/sync-onepiece', auth_1.authenticate, admin_1.requireAdmin, async (_req, res) => {
        try {
            logger_1.logger.info('Manual One Piece sync requested');
            (async () => {
                try {
                    const result = await (0, onePieceSync_1.syncOnePieceData)();
                    logger_1.logger.info('Manual One Piece sync completed', result);
                }
                catch (error) {
                    logger_1.logger.error('Manual One Piece sync failed', { error: error.message });
                }
            })();
            res.status(202).json({ success: true, message: 'One Piece sync started in background.' });
        }
        catch (error) {
            logger_1.logger.error('Error starting manual One Piece sync', { error: error.message });
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
            environment: env_1.env.nodeEnv,
        });
    });
    app.get('/api/status', async (_req, res) => {
        try {
            res.json({
                status: 'running',
                timestamp: new Date().toISOString(),
                environment: env_1.env.nodeEnv,
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
        }
        catch (error) {
            logger_1.logger.error('Error getting status', { error: error.message });
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
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    server = app.listen(port, () => {
        logger_1.logger.info(`TCGTracker Backend server running on http://${env_1.env.host}:${port}`);
        logger_1.logger.info(`Price data updates scheduled daily at 2:00 AM EST`);
        logger_1.logger.info(`API documentation available at http://${env_1.env.host}:${port}/api-docs`);
        logger_1.logger.info(`Environment: ${env_1.env.nodeEnv}`);
    });
}
async function bootstrap() {
    try {
        logger_1.logger.info('Initializing database...');
        await (0, database_1.initializeDatabase)();
        const db = (0, database_1.getDb)();
        await (0, migrations_1.runMigrations)(db);
        const authService = new authService_1.AuthService(db);
        const alertService = new alertService_1.AlertService(db);
        const portfolioService = new portfolioService_1.PortfolioService(db);
        await Promise.all([
            authService.init(),
            alertService.init(),
        ]);
        setupRoutes(authService, alertService, portfolioService);
        void initializeSetCodeService().catch((error) => {
            logger_1.logger.error('Background set code service initialization failed', {
                error: error.message,
            });
        });
        (async () => {
            await new Promise((r) => setTimeout(r, 15000));
            try {
                const result = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
                logger_1.logger.info('Startup image backfill completed', result);
            }
            catch (error) {
                logger_1.logger.warn('Startup image backfill failed (non-fatal)', { error: error.message });
            }
        })();
        (async () => {
            await new Promise((r) => setTimeout(r, 20000));
            try {
                const incomplete = await (0, onePieceSync_1.isOnePieceCatalogIncomplete)();
                if (incomplete) {
                    logger_1.logger.info('One Piece catalog incomplete — running sync in background');
                    const result = await (0, onePieceSync_1.syncOnePieceData)();
                    logger_1.logger.info('One Piece sync completed', result);
                }
            }
            catch (error) {
                logger_1.logger.warn('One Piece catalog check / sync failed (non-fatal)', { error: error.message });
            }
        })();
    }
    catch (error) {
        logger_1.logger.error('Failed to start server', { error });
        process.exit(1);
    }
}
function shutdown(signal) {
    logger_1.logger.info(`${signal} received — shutting down gracefully`);
    if (server) {
        server.close(() => {
            logger_1.logger.info('HTTP server closed');
            process.exit(0);
        });
        setTimeout(() => {
            logger_1.logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    }
    else {
        process.exit(0);
    }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
bootstrap();
exports.default = app;
