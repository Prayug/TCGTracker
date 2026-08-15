"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const priceHistory_1 = __importDefault(require("./routes/priceHistory"));
const cardSearch_1 = __importDefault(require("./routes/cardSearch"));
const onePieceCards_1 = __importDefault(require("./routes/onePieceCards"));
const onePieceSync_1 = require("./services/onePieceSync");
const setTracker_1 = __importDefault(require("./routes/setTracker"));
const enhancedPacks_1 = __importDefault(require("./routes/enhancedPacks"));
const marketInsights_1 = __importDefault(require("./routes/marketInsights"));
const slabInsights_1 = __importDefault(require("./routes/slabInsights"));
const investments_1 = __importDefault(require("./routes/investments"));
const ebayNotifications_1 = __importDefault(require("./routes/ebayNotifications"));
const deals_1 = __importDefault(require("./routes/deals"));
const grading_1 = __importDefault(require("./routes/grading"));
const captureSessions_1 = __importDefault(require("./routes/captureSessions"));
const trades_1 = __importDefault(require("./routes/trades"));
const database_1 = require("./db/database");
const dataFetcher_1 = require("./services/dataFetcher");
const cloudBackupService_1 = require("./services/cloudBackupService");
const catalogSync_1 = require("./services/catalogSync");
const env_1 = require("./config/env");
const swagger_1 = require("./config/swagger");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const auth_1 = require("./middleware/auth");
const admin_1 = require("./middleware/admin");
const logger_1 = require("./utils/logger");
const auth_2 = require("./routes/auth");
const alerts_1 = require("./routes/alerts");
const portfolio_1 = require("./routes/portfolio");
const binders_1 = require("./routes/binders");
const watchlists_1 = require("./routes/watchlists");
function registerAdminRoutes(app) {
    app.post('/api/update', auth_1.authenticate, admin_1.requireAdmin, async (req, res) => {
        var _a;
        try {
            const requested = (typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.runDate) === 'string' && req.body.runDate) ||
                (typeof req.query.date === 'string' && req.query.date) ||
                '';
            const runDate = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : undefined;
            logger_1.logger.info('Manual price data update requested', { runDate: runDate || (0, dataFetcher_1.getRunDate)() });
            const result = await (0, dataFetcher_1.updatePriceData)(runDate ? { runDate } : undefined);
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
    app.post('/api/sync-catalog-ja', auth_1.authenticate, admin_1.requireAdmin, async (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        try {
            const full = String((_c = (_a = req.query.full) !== null && _a !== void 0 ? _a : (_b = req.body) === null || _b === void 0 ? void 0 : _b.full) !== null && _c !== void 0 ? _c : '').toLowerCase() === '1' ||
                String((_f = (_d = req.query.full) !== null && _d !== void 0 ? _d : (_e = req.body) === null || _e === void 0 ? void 0 : _e.full) !== null && _f !== void 0 ? _f : '').toLowerCase() === 'true' ||
                String((_j = (_g = req.query.mode) !== null && _g !== void 0 ? _g : (_h = req.body) === null || _h === void 0 ? void 0 : _h.mode) !== null && _j !== void 0 ? _j : '').toLowerCase() === 'full';
            const limitRaw = Number((_m = (_k = req.query.limit) !== null && _k !== void 0 ? _k : (_l = req.body) === null || _l === void 0 ? void 0 : _l.limit) !== null && _m !== void 0 ? _m : (full ? 250 : 13));
            const setLimit = Number.isFinite(limitRaw)
                ? Math.min(Math.max(limitRaw, 1), full ? 250 : 80)
                : full
                    ? 250
                    : 13;
            logger_1.logger.info('Manual Japanese catalog sync requested', { setLimit, full });
            (async () => {
                try {
                    const result = await (0, catalogSync_1.syncJapaneseCatalogData)(setLimit, { priorityOnly: !full });
                    logger_1.logger.info('Manual Japanese catalog sync completed', result);
                }
                catch (error) {
                    logger_1.logger.error('Manual Japanese catalog sync failed', { error: error.message });
                }
            })();
            res.status(202).json({
                success: true,
                message: full
                    ? `Full Japanese catalog sync started (up to ${setLimit} sets).`
                    : `Japanese catalog sync started (up to ${setLimit} priority sets).`,
            });
        }
        catch (error) {
            logger_1.logger.error('Error starting Japanese catalog sync', { error: error.message });
            res.status(500).json({ success: false, error: 'Failed to start Japanese catalog sync' });
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
}
function registerHealthRoutes(app) {
    app.get('/health', (_req, res) => {
        (0, dataFetcher_1.maybeRecoverStalePrices)();
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });
    app.get('/api/health', async (_req, res) => {
        (0, dataFetcher_1.maybeRecoverStalePrices)();
        try {
            const prices = await (0, dataFetcher_1.getPriceFreshness)();
            res.json({
                status: prices.stale ? 'degraded' : 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                environment: env_1.env.nodeEnv,
                prices,
            });
        }
        catch (error) {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                environment: env_1.env.nodeEnv,
                prices: { error: error.message },
            });
        }
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
                binders: '/api/binders',
                'market-insights': '/api/market-insights',
                status: '/api/status',
                health: '/api/health',
            },
        });
    });
}
function registerRoutes(app, services) {
    const { authService, alertService, portfolioService, binderService, watchlistService } = services;
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
    logger_1.logger.info(`API Documentation available at http://${env_1.env.host}:${env_1.env.port}/api-docs`);
    app.use('/api/auth', (0, auth_2.createAuthRouter)(authService));
    app.use('/api/alerts', (0, alerts_1.createAlertsRouter)(alertService));
    app.use('/api/portfolio', (0, portfolio_1.createPortfolioRouter)(portfolioService));
    app.use('/api/watchlists', (0, watchlists_1.createWatchlistsRouter)(watchlistService));
    app.use('/api/prices', priceHistory_1.default);
    app.use('/api/cards', setTracker_1.default);
    app.use('/api/cards', cardSearch_1.default);
    app.use('/api/cards', onePieceCards_1.default);
    app.use('/api/packs', enhancedPacks_1.default);
    app.use('/api/binders', (0, binders_1.createBinderRouter)(binderService));
    app.use('/api/market-insights', marketInsights_1.default);
    app.use('/api/slab-insights', slabInsights_1.default);
    app.use('/api/investments', investments_1.default);
    app.use('/api/deals', deals_1.default);
    app.use('/api/ebay/marketplace-account-deletion', ebayNotifications_1.default);
    app.use('/api/grading', grading_1.default);
    app.use('/api/trades', trades_1.default);
    app.use('/api/capture-sessions', rateLimiter_1.captureSessionLimiter, captureSessions_1.default);
    registerAdminRoutes(app);
    registerHealthRoutes(app);
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
}
