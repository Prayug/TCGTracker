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
exports.setupScheduledJobs = setupScheduledJobs;
const node_cron_1 = __importDefault(require("node-cron"));
const dataFetcher_1 = require("./services/dataFetcher");
const catalogSync_1 = require("./services/catalogSync");
const onePieceSync_1 = require("./services/onePieceSync");
const cardImageBackfillService_1 = require("./services/cardImageBackfillService");
const logger_1 = require("./utils/logger");
const PRICE_CATCHUP_INTERVAL_MS = 10 * 60 * 1000;
async function runDailyPriceUpdate(alertService) {
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
        try {
            const { materializeCanonicalPrices } = await Promise.resolve().then(() => __importStar(require('./services/canonicalPriceService')));
            const canonical = await materializeCanonicalPrices();
            logger_1.logger.info('Canonical prices refreshed', canonical);
        }
        catch (canonErr) {
            logger_1.logger.warn('Canonical price materialization failed', { error: canonErr.message });
        }
        try {
            const triggered = await alertService.evaluateAllSmartAlertsFromPrices();
            logger_1.logger.info('Smart alerts evaluated after price update', { triggered });
        }
        catch (alertErr) {
            logger_1.logger.warn('Smart alert evaluation failed', { error: alertErr.message });
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to update price data', { error: error.message });
    }
}
async function runPriceUpdateCatchUp(alertService) {
    try {
        const result = await (0, dataFetcher_1.recoverMissedPriceUpdates)();
        if (result.skipped) {
            logger_1.logger.info('Price update catch-up skipped', { reason: result.reason });
            return;
        }
        logger_1.logger.info('Price update catch-up completed', result);
        const imageResult = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
        logger_1.logger.info('Post-catch-up image backfill completed', imageResult);
        try {
            const triggered = await alertService.evaluateAllSmartAlertsFromPrices();
            logger_1.logger.info('Smart alerts evaluated after catch-up', { triggered });
        }
        catch (alertErr) {
            logger_1.logger.warn('Smart alert evaluation failed after catch-up', { error: alertErr.message });
        }
    }
    catch (error) {
        logger_1.logger.error('Price update catch-up failed', { error: error.message });
    }
}
async function runGradedHistoryCatchUp() {
    try {
        const { snapshotAllGradedPricesToHistory, backfillGradedHistoryFromCache, } = await Promise.resolve().then(() => __importStar(require('./services/gradedPriceService')));
        const { withDbJobLock } = await Promise.resolve().then(() => __importStar(require('./utils/dbJobLock')));
        await withDbJobLock('graded-history-snapshot', async () => {
            await backfillGradedHistoryFromCache();
            return snapshotAllGradedPricesToHistory();
        }, { skipIfBusy: true });
    }
    catch (error) {
        logger_1.logger.warn('Graded history catch-up failed', { error: error.message });
    }
}
async function runGradedDataRefresh() {
    logger_1.logger.info('Running scheduled graded data refresh...');
    try {
        const { snapshotAllGradedPricesToHistory, backfillGradedHistoryFromCache, } = await Promise.resolve().then(() => __importStar(require('./services/gradedPriceService')));
        const { runAllCardsRefresh } = await Promise.resolve().then(() => __importStar(require('./services/gradedRefreshService')));
        const snap = await snapshotAllGradedPricesToHistory();
        logger_1.logger.info('Graded history daily snapshot completed', snap);
        const result = await runAllCardsRefresh({
            maxDurationMs: 1000 * 60 * 60 * 6,
            delayMs: 750,
        });
        logger_1.logger.info('Graded data refresh completed', result);
        const snap2 = await snapshotAllGradedPricesToHistory();
        logger_1.logger.info('Graded history post-scrape snapshot completed', snap2);
        const backfill = await backfillGradedHistoryFromCache();
        logger_1.logger.info('Graded history cache backfill completed', backfill);
    }
    catch (error) {
        logger_1.logger.error('Graded data refresh failed', { error: error.message });
    }
}
async function runSignalScrapeJob(label) {
    logger_1.logger.info(label);
    try {
        const { runSignalScrape } = await Promise.resolve().then(() => __importStar(require('./services/scrapers/scraperRunner')));
        const result = await runSignalScrape();
        logger_1.logger.info(label.replace('Running', 'Completed').replace('...', ''), result);
    }
    catch (error) {
        logger_1.logger.error('Failed to run signal scrape', { error: error.message });
    }
}
function setupScheduledJobs(alertService) {
    node_cron_1.default.schedule('0 2 * * *', () => {
        void runDailyPriceUpdate(alertService);
    }, { timezone: 'America/New_York' });
    setTimeout(() => void runPriceUpdateCatchUp(alertService), 60000);
    setInterval(() => void runPriceUpdateCatchUp(alertService), PRICE_CATCHUP_INTERVAL_MS);
    node_cron_1.default.schedule('0 16 * * *', () => {
        logger_1.logger.info('Running afternoon price snapshot (16:00 ET)...');
        void runPriceUpdateCatchUp(alertService);
    }, { timezone: 'America/New_York' });
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
    node_cron_1.default.schedule('30 2 * * *', () => {
        void runGradedDataRefresh();
    }, { timezone: 'America/New_York' });
    setTimeout(() => void runGradedHistoryCatchUp(), 60000);
    setInterval(() => void runGradedHistoryCatchUp(), 6 * 60 * 60 * 1000);
    node_cron_1.default.schedule('0 12,18 * * *', () => {
        void runGradedHistoryCatchUp();
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('0 3 * * *', async () => {
        logger_1.logger.info('Running scheduled prediction run...');
        try {
            const { runPredictions } = await Promise.resolve().then(() => __importStar(require('./services/predictionEngine')));
            const { updateActualResults } = await Promise.resolve().then(() => __importStar(require('./services/forwardTestTracker')));
            await runPredictions();
            await updateActualResults();
            logger_1.logger.info('Scheduled prediction run completed');
            const { runSlabPredictions } = await Promise.resolve().then(() => __importStar(require('./services/slabPredictionEngine')));
            const { updateSlabActualResults } = await Promise.resolve().then(() => __importStar(require('./services/slabForwardTest')));
            await runSlabPredictions();
            await updateSlabActualResults();
            logger_1.logger.info('Scheduled slab prediction run completed');
        }
        catch (error) {
            logger_1.logger.error('Failed to run predictions', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('30 3 * * *', async () => {
        logger_1.logger.info('Running data quality checks and retention...');
        try {
            const { runDataQualityChecks } = await Promise.resolve().then(() => __importStar(require('./services/dataQualityService')));
            const { runRetentionPolicies } = await Promise.resolve().then(() => __importStar(require('./services/retentionService')));
            const quality = await runDataQualityChecks();
            const retention = await runRetentionPolicies({ keepPredictionRuns: 30 });
            logger_1.logger.info('Data quality + retention completed', {
                passed: quality.passed,
                warned: quality.warned,
                failed: quality.failed,
                ...retention,
            });
        }
        catch (error) {
            logger_1.logger.error('Data quality / retention failed', { error: error.message });
        }
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('0 4 * * *', () => {
        void runSignalScrapeJob('Running scheduled signal scrape...');
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('30 */6 * * *', () => {
        void runSignalScrapeJob('Running scheduled social signal scrape...');
    }, { timezone: 'America/New_York' });
    node_cron_1.default.schedule('0 5 * * 0', () => {
        void runSignalScrapeJob('Running scheduled weekly signal scrape...');
    }, { timezone: 'America/New_York' });
}
