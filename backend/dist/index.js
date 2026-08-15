"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sentry_1 = require("./config/sentry");
const app_1 = require("./app");
const routes_1 = require("./routes");
const jobs_1 = require("./jobs");
const server_1 = require("./server");
const database_1 = require("./db/database");
const migrations_1 = require("./db/migrations");
const dataFetcher_1 = require("./services/dataFetcher");
const cardImageBackfillService_1 = require("./services/cardImageBackfillService");
const onePieceSync_1 = require("./services/onePieceSync");
const authService_1 = require("./services/authService");
const alertService_1 = require("./services/alertService");
const portfolioService_1 = require("./services/portfolioService");
const binderService_1 = require("./services/binderService");
const watchlistService_1 = require("./services/watchlistService");
const setCodeService_1 = require("./services/setCodeService");
const logger_1 = require("./utils/logger");
(0, sentry_1.initSentry)();
const app = (0, app_1.createApp)();
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
async function bootstrap() {
    try {
        logger_1.logger.info('Initializing database...');
        await (0, database_1.initializeDatabase)();
        const db = (0, database_1.getDb)();
        await (0, migrations_1.runMigrations)(db);
        const authService = new authService_1.AuthService(db);
        const alertService = new alertService_1.AlertService(db);
        const portfolioService = new portfolioService_1.PortfolioService(db);
        const binderService = new binderService_1.BinderService(db);
        const watchlistService = new watchlistService_1.WatchlistService(db);
        await Promise.all([
            authService.init(),
            alertService.init(),
            watchlistService.ensureSchema(),
        ]);
        (0, routes_1.registerRoutes)(app, {
            authService,
            alertService,
            portfolioService,
            binderService,
            watchlistService,
        });
        (0, jobs_1.setupScheduledJobs)(alertService);
        (0, server_1.startServer)(app);
        void (0, dataFetcher_1.failStalePriceUpdateRuns)()
            .then((n) => {
            if (n > 0)
                logger_1.logger.warn('Marked stale price_update runs as failed', { count: n });
        })
            .catch((error) => {
            logger_1.logger.warn('Could not clear stale price_update runs', { error: error.message });
        });
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
        logger_1.logger.error('Failed to start server', {
            error: error instanceof Error ? error.message : error,
        });
        process.exit(1);
    }
}
process.on('SIGTERM', () => (0, server_1.shutdown)('SIGTERM'));
process.on('SIGINT', () => (0, server_1.shutdown)('SIGINT'));
bootstrap();
exports.default = app;
