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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const predictionEngine_1 = require("../services/predictionEngine");
const backtestEngine_1 = require("../services/backtestEngine");
const forwardTestTracker_1 = require("../services/forwardTestTracker");
const externalSignalService_1 = require("../services/externalSignalService");
const scraperRunner_1 = require("../services/scrapers/scraperRunner");
const aiExplanationService_1 = require("../services/aiExplanationService");
const returnCalibration_1 = require("../services/returnCalibration");
const horizonSupport_1 = require("../services/horizonSupport");
const dataQualityService_1 = require("../services/dataQualityService");
const auth_1 = require("../middleware/auth");
const admin_1 = require("../middleware/admin");
const router = (0, express_1.Router)();
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Market insights route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
router.get('/predictions', asyncHandler(async (req, res) => {
    var _a;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const category = req.query.category;
    const search = req.query.search;
    const sortBy = req.query.sortBy || 'return';
    const sortOrder = req.query.sortOrder || 'desc';
    const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice) : undefined;
    const minConfidence = req.query.minConfidence !== undefined ? parseFloat(req.query.minConfidence) : undefined;
    const rarities = req.query.rarities
        ? req.query.rarities.split(',').map(r => r.trim()).filter(Boolean)
        : undefined;
    const eras = req.query.eras
        ? req.query.eras.split(',').map(e => e.trim()).filter(Boolean)
        : undefined;
    const setIds = req.query.setIds
        ? req.query.setIds.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;
    const releaseDateFrom = req.query.releaseDateFrom;
    const releaseDateTo = req.query.releaseDateTo;
    const gameParam = (_a = req.query.game) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    const game = gameParam === 'onepiece' || gameParam === 'pokemon' ? gameParam : undefined;
    const windowParam = req.query.window || '90d';
    const window = (0, predictionEngine_1.isPredictionWindow)(windowParam) ? windowParam : '90d';
    const horizonSupport = await (0, horizonSupport_1.getHorizonSupportStatus)();
    const horizonDays = (0, horizonSupport_1.windowToHorizonDays)(window);
    // Prefer a supported window when the requested one lacks history.
    let effectiveWindow = window;
    if (horizonSupport.unsupported.includes(horizonDays)) {
        const fallback = [90, 30, 7].find((h) => horizonSupport.supported.includes(h));
        if (fallback)
            effectiveWindow = `${fallback}d`;
    }
    const predictions = await (0, predictionEngine_1.getLatestPredictions)(limit, category, {
        minPrice,
        maxPrice,
        minConfidence,
        rarities,
        eras,
        setIds,
        releaseDateFrom,
        releaseDateTo,
        search,
        sortBy: sortBy,
        sortOrder: sortOrder,
        game,
    }, effectiveWindow);
    res.json({
        data: predictions,
        count: predictions.length,
        window: effectiveWindow,
        requestedWindow: window,
        horizonSupport,
        experimental: horizonSupport.experimental.includes((0, horizonSupport_1.windowToHorizonDays)(effectiveWindow)),
        modelVersion: '3.2.0',
    });
}));
router.get('/horizon-support', asyncHandler(async (_req, res) => {
    const horizonSupport = await (0, horizonSupport_1.getHorizonSupportStatus)(true);
    res.json({ data: horizonSupport });
}));
router.get('/data-quality', asyncHandler(async (_req, res) => {
    const summary = await (0, dataQualityService_1.getLatestDataQualityChecks)();
    res.json({
        data: summary.checks,
        runAt: summary.runAt,
        passed: summary.passed,
        warned: summary.warned,
        failed: summary.failed,
    });
}));
router.post('/data-quality/run', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    const summary = await (0, dataQualityService_1.runDataQualityChecks)();
    res.json({ data: summary });
}));
router.get('/overview', asyncHandler(async (req, res) => {
    var _a, _b, _c, _d, _e;
    const db = (0, database_1.getDb)();
    const gameParam = (_a = req.query.game) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    const game = gameParam === 'onepiece' || gameParam === 'pokemon' ? gameParam : undefined;
    const gameClause = game === 'onepiece' ? ` AND card_id LIKE 'op:%'` :
        game === 'pokemon' ? ` AND card_id NOT LIKE 'op:%'` :
            '';
    const cpGameClause = game === 'onepiece' ? ` AND cp.card_id LIKE 'op:%'` :
        game === 'pokemon' ? ` AND cp.card_id NOT LIKE 'op:%'` :
            '';
    const statsRow = await new Promise((resolve, reject) => {
        db.get(`SELECT
        COUNT(*) AS totalPredictions,
        ROUND(AVG(confidence_score), 1) AS avgConfidence,
        ROUND(AVG(risk_score), 1) AS avgRisk,
        ROUND(AVG(expected_90d_return), 4) AS avgExpectedReturn90d,
        ROUND(AVG(expected_30d_return), 4) AS avgExpectedReturn30d,
        SUM(CASE WHEN expected_90d_return > 0.01 THEN 1 ELSE 0 END) AS bullishCount,
        SUM(CASE WHEN expected_90d_return < -0.01 THEN 1 ELSE 0 END) AS bearishCount
      FROM card_predictions
      WHERE run_id = (SELECT MAX(id) FROM prediction_runs)${gameClause}`, [], (err, row) => err ? reject(err) : resolve(row));
    });
    const categoryRows = await new Promise((resolve, reject) => {
        db.all(`SELECT category, COUNT(*) AS count
       FROM card_predictions
       WHERE run_id = (SELECT MAX(id) FROM prediction_runs)${gameClause}
       GROUP BY category
       ORDER BY count DESC`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const topGainers = await new Promise((resolve, reject) => {
        db.all(`SELECT cp.card_id, cm.cardName, cp.current_price, cp.expected_90d_return,
              cp.confidence_score, cp.category
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
         AND cp.expected_90d_return IS NOT NULL
         AND cp.confidence_score >= 55${cpGameClause}
       ORDER BY cp.expected_90d_return DESC
       LIMIT 5`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const topLosers = await new Promise((resolve, reject) => {
        db.all(`SELECT cp.card_id, cm.cardName, cp.current_price, cp.expected_90d_return,
              cp.confidence_score, cp.category
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
         AND cp.expected_90d_return IS NOT NULL
         AND cp.confidence_score >= 55${cpGameClause}
       ORDER BY cp.expected_90d_return ASC
       LIMIT 5`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const confidenceBuckets = await new Promise((resolve, reject) => {
        db.all(`SELECT
        CASE
          WHEN confidence_score >= 80 THEN '80-100'
          WHEN confidence_score >= 60 THEN '60-79'
          WHEN confidence_score >= 40 THEN '40-59'
          WHEN confidence_score >= 20 THEN '20-39'
          ELSE '0-19'
        END AS bucket,
        COUNT(*) AS count
       FROM card_predictions
       WHERE run_id = (SELECT MAX(id) FROM prediction_runs)${gameClause}
       GROUP BY bucket
       ORDER BY bucket DESC`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const categoryBreakdown = categoryRows.reduce((acc, row) => {
        acc[row.category] = row.count;
        return acc;
    }, {});
    // Market direction: majority sentiment of calibrated predictions, with a
    // neutral band when the market is roughly balanced.
    const bullishCount = statsRow.bullishCount || 0;
    const bearishCount = statsRow.bearishCount || 0;
    const totalDirectional = bullishCount + bearishCount;
    let marketDirection = 'neutral';
    if (totalDirectional > 0) {
        const bullishShare = bullishCount / totalDirectional;
        if (bullishShare > 0.55)
            marketDirection = 'bullish';
        else if (bullishShare < 0.45)
            marketDirection = 'bearish';
    }
    // Context: the realized market median from calibration (what cards actually
    // returned) so the overview's numbers can be compared to reality.
    const calibrationModels = await (0, returnCalibration_1.getCalibrationModels)();
    const marketBenchmark90d = (_c = (_b = calibrationModels[90]) === null || _b === void 0 ? void 0 : _b.marketMedianReturn) !== null && _c !== void 0 ? _c : null;
    const marketBenchmark30d = (_e = (_d = calibrationModels[30]) === null || _d === void 0 ? void 0 : _d.marketMedianReturn) !== null && _e !== void 0 ? _e : null;
    res.json({
        totalPredictions: statsRow.totalPredictions || 0,
        avgConfidence: statsRow.avgConfidence || 0,
        avgRisk: statsRow.avgRisk || 0,
        avgExpectedReturn90d: statsRow.avgExpectedReturn90d || 0,
        avgExpectedReturn30d: statsRow.avgExpectedReturn30d || 0,
        marketDirection,
        categoryBreakdown,
        topGainers: topGainers.map((r) => ({
            cardId: r.card_id,
            cardName: r.cardName || r.card_id,
            currentPrice: r.current_price,
            expectedReturn: r.expected_90d_return,
            confidence: r.confidence_score,
            category: r.category,
        })),
        topLosers: topLosers.map((r) => ({
            cardId: r.card_id,
            cardName: r.cardName || r.card_id,
            currentPrice: r.current_price,
            expectedReturn: r.expected_90d_return,
            confidence: r.confidence_score,
            category: r.category,
        })),
        confidenceBuckets: confidenceBuckets.map((r) => ({
            bucket: r.bucket,
            count: r.count,
        })),
        marketBenchmark90d,
        marketBenchmark30d,
    });
}));
router.get('/card/:cardId', asyncHandler(async (req, res) => {
    var _a, _b, _c, _d;
    const { cardId } = req.params;
    const db = (0, database_1.getDb)();
    const prediction = await new Promise((resolve, reject) => {
        db.get(`       SELECT cp.*,
              cm.cardName, cm.setName, cm.setId, cm.cardNumber,
              COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
              cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName, MIN(setId) AS setId,
                MIN(cardNumber) AS cardNumber, MIN(rarity) AS rarity,
                 MIN(NULLIF(imageLarge, '')) AS imageLarge,
                 MIN(NULLIF(imageSmall, '')) AS imageSmall,
                MIN(COALESCE(tcgplayerProductId, CAST(productId AS TEXT))) AS tcgplayerProductId
         FROM card_mappings
         GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       LEFT JOIN catalog_cards cc ON cc.cardId = cp.card_id
       WHERE cp.card_id = ? AND cp.run_id = (SELECT MAX(id) FROM prediction_runs)
       LIMIT 1`, [cardId], (err, row) => {
            if (err)
                return reject(err);
            resolve(row || null);
        });
    });
    if (!prediction) {
        return res.status(404).json({ error: 'No prediction found for this card' });
    }
    const result = await new Promise((resolve, reject) => {
        db.get(`SELECT * FROM prediction_results WHERE prediction_id = ?`, [prediction.id], (err, row) => {
            if (err)
                return reject(err);
            resolve(row || null);
        });
    });
    res.json({
        prediction: {
            id: prediction.id,
            cardId: prediction.card_id,
            cardName: prediction.cardName || '',
            setId: prediction.setId || '',
            setName: prediction.setName || '',
            cardNumber: prediction.cardNumber || '',
            rarity: prediction.rarity || '',
            imageSmall: prediction.imageSmall || undefined,
            imageLarge: prediction.imageLarge || undefined,
            tcgplayerProductId: prediction.tcgplayerProductId || undefined,
            uniqueIdentifier: prediction.unique_identifier || undefined,
            variantKey: prediction.variant_key || undefined,
            currentPrice: prediction.current_price,
            predicted7d: {
                low: prediction.predicted_7d_low,
                mid: prediction.predicted_7d_mid,
                high: prediction.predicted_7d_high,
            },
            predicted30d: {
                low: prediction.predicted_30d_low,
                mid: prediction.predicted_30d_mid,
                high: prediction.predicted_30d_high,
            },
            predicted90d: {
                low: prediction.predicted_90d_low,
                mid: prediction.predicted_90d_mid,
                high: prediction.predicted_90d_high,
            },
            predicted180d: prediction.predicted_180d_mid != null ? {
                low: prediction.predicted_180d_low,
                mid: prediction.predicted_180d_mid,
                high: prediction.predicted_180d_high,
            } : null,
            predicted365d: prediction.predicted_365d_mid != null ? {
                low: prediction.predicted_365d_low,
                mid: prediction.predicted_365d_mid,
                high: prediction.predicted_365d_high,
            } : null,
            expected7dReturn: prediction.expected_7d_return,
            expected30dReturn: prediction.expected_30d_return,
            expected90dReturn: prediction.expected_90d_return,
            expected180dReturn: (_a = prediction.expected_180d_return) !== null && _a !== void 0 ? _a : null,
            expected365dReturn: (_b = prediction.expected_365d_return) !== null && _b !== void 0 ? _b : null,
            confidenceScore: prediction.confidence_score,
            riskScore: prediction.risk_score,
            category: prediction.category,
            suggestedAction: prediction.suggested_action,
            explanation: prediction.explanation,
            riskFactors: prediction.risk_factors,
            externalSignals: prediction.external_signals_json,
        },
        result: result ? {
            actual7dPrice: result.actual_7d_price,
            actual30dPrice: result.actual_30d_price,
            actual90dPrice: result.actual_90d_price,
            actual180dPrice: (_c = result.actual_180d_price) !== null && _c !== void 0 ? _c : null,
            actual365dPrice: (_d = result.actual_365d_price) !== null && _d !== void 0 ? _d : null,
            status: result.status,
        } : null,
    });
}));
router.post('/run-predictions', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    logger_1.logger.info('Manual prediction run requested');
    const result = await (0, predictionEngine_1.runPredictions)();
    // Best-effort: resolve any matured forward-test windows after a new run.
    try {
        const ft = await (0, forwardTestTracker_1.updateActualResults)();
        logger_1.logger.info(`Forward-test update after prediction run: ${ft.updated} rows`);
    }
    catch (err) {
        logger_1.logger.warn('Forward-test update after prediction run failed:', err);
    }
    res.status(202).json({
        success: true,
        runId: result.runId,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        message: `Prediction run complete: ${result.succeeded} predictions generated, ${result.failed} skipped`,
    });
}));
router.post('/backtest', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (req, res) => {
    const { backtestDate, windowDays = 90, cardIds } = req.body;
    if (!backtestDate) {
        return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
    }
    logger_1.logger.info(`Backtest requested for date ${backtestDate}, window ${windowDays} days`);
    const models = await (0, returnCalibration_1.getCalibrationModels)();
    const result = await (0, backtestEngine_1.runBacktest)(backtestDate, windowDays, cardIds || undefined, undefined, undefined, models);
    // Feed (predicted, actual) pairs into calibration so longer horizons
    // accumulate training data from real market history.
    if (!cardIds) {
        try {
            const stored = await (0, returnCalibration_1.storeBacktestSamples)(result);
            if (stored > 0) {
                await (0, returnCalibration_1.rebuildAllCalibrationModels)();
                logger_1.logger.info(`Backtest stored ${stored} calibration samples`);
            }
        }
        catch (err) {
            logger_1.logger.warn('Failed to store backtest calibration samples:', err);
        }
    }
    res.json(result);
}));
router.get('/calibration/status', asyncHandler(async (_req, res) => {
    const models = await (0, returnCalibration_1.getCalibrationModels)();
    res.json({ data: (0, returnCalibration_1.getCalibrationStatus)(models) });
}));
router.post('/calibration/rebuild', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    logger_1.logger.info('Manual calibration rebuild requested');
    await (0, returnCalibration_1.collectForwardTestSamples)();
    const models = await (0, returnCalibration_1.rebuildAllCalibrationModels)();
    res.status(202).json({
        success: true,
        data: (0, returnCalibration_1.getCalibrationStatus)(models),
    });
}));
router.post('/calibration/harvest', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    // Harvest long-horizon samples from historical backtests. Cutoffs are chosen
    // so the forward window has matured against real price history.
    const { harvestBacktestSamples } = await Promise.resolve().then(() => __importStar(require('../services/returnCalibration')));
    const today = new Date();
    const cutoffDate = (daysAgo) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysAgo);
        return d.toISOString().split('T')[0];
    };
    const cutoffs = [cutoffDate(125), cutoffDate(105), cutoffDate(85)];
    const stored90 = await harvestBacktestSamples(cutoffs, 90, 2500);
    const models = await (0, returnCalibration_1.rebuildAllCalibrationModels)();
    res.status(202).json({
        success: true,
        stored90,
        data: (0, returnCalibration_1.getCalibrationStatus)(models),
    });
}));
router.get('/backtest-results', asyncHandler(async (_req, res) => {
    const results = await (0, backtestEngine_1.getBacktestResults)();
    res.json({ data: results });
}));
router.get('/forward-test', asyncHandler(async (_req, res) => {
    const status = await (0, forwardTestTracker_1.getForwardTestStatus)();
    res.json(status);
}));
router.post('/forward-test/update', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    const result = await (0, forwardTestTracker_1.updateActualResults)();
    try {
        await (0, returnCalibration_1.collectForwardTestSamples)();
        await (0, returnCalibration_1.rebuildAllCalibrationModels)();
    }
    catch (err) {
        logger_1.logger.warn('Calibration refresh after forward-test update failed:', err);
    }
    res.json({ success: true, updated: result.updated });
}));
router.get('/external-signals/:cardId', asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const signals = await (0, externalSignalService_1.getExternalSignalsForCard)(cardId);
    res.json({ data: signals });
}));
router.post('/run-scrape', auth_1.authenticate, admin_1.requireAdmin, asyncHandler(async (_req, res) => {
    logger_1.logger.info('Manual signal scrape requested');
    const result = await (0, scraperRunner_1.runSignalScrape)();
    res.status(202).json({
        success: true,
        scraped: result.scraped,
        stored: result.stored,
        errors: result.errors,
        message: `Signal scrape complete: ${result.stored} signals stored from ${result.scraped} unique signals`,
    });
}));
router.get('/card/:cardId/explanation', asyncHandler(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { cardId } = req.params;
    const db = (0, database_1.getDb)();
    const prediction = await new Promise((resolve, reject) => {
        db.get(`SELECT cp.*, cm.cardName, cm.setName, cm.rarity
       FROM card_predictions cp
       LEFT JOIN (
         SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName,
                COALESCE(NULLIF(TRIM(MIN(rarity)), ''), '') AS rarity
         FROM card_mappings
         GROUP BY cardId
       ) cm ON cm.cardId = cp.card_id
       LEFT JOIN catalog_cards cc ON cc.cardId = cp.card_id
       WHERE cp.card_id = ? AND cp.run_id = (SELECT MAX(id) FROM prediction_runs)
       LIMIT 1`, [cardId], (err, row) => {
            if (err)
                return reject(err);
            resolve(row || null);
        });
    });
    if (!prediction) {
        return res.status(404).json({ error: 'No prediction found for this card' });
    }
    const existingExplanation = (_a = prediction.explanation) !== null && _a !== void 0 ? _a : '';
    if ((0, aiExplanationService_1.isAiExplanation)(existingExplanation)) {
        return res.json({ explanation: existingExplanation, cached: true });
    }
    const setReleaseDate = await new Promise((resolve) => {
        db.get(`SELECT setReleaseDate FROM catalog_cards
       WHERE cardId = ? AND setReleaseDate IS NOT NULL AND TRIM(setReleaseDate) <> ''
       LIMIT 1`, [cardId], (err, row) => resolve(err || !row ? null : row.setReleaseDate));
    });
    const ctx = {
        cardName: prediction.cardName || prediction.card_id,
        setName: prediction.setName || '',
        currentPrice: (_b = prediction.current_price) !== null && _b !== void 0 ? _b : 0,
        category: (_c = prediction.category) !== null && _c !== void 0 ? _c : '',
        rarity: prediction.rarity || undefined,
        predictedReturns: {
            d7: (_d = prediction.expected_7d_return) !== null && _d !== void 0 ? _d : 0,
            d30: (_e = prediction.expected_30d_return) !== null && _e !== void 0 ? _e : 0,
            d90: (_f = prediction.expected_90d_return) !== null && _f !== void 0 ? _f : 0,
        },
        confidence: (_g = prediction.confidence_score) !== null && _g !== void 0 ? _g : 0,
        riskScore: (_h = prediction.risk_score) !== null && _h !== void 0 ? _h : 0,
        externalSignals: (_j = prediction.external_signals_json) !== null && _j !== void 0 ? _j : '[]',
        setAgeDays: setReleaseDate ? (0, predictionEngine_1.computeSetAgeDays)(setReleaseDate) : null,
    };
    let aiExplanation;
    try {
        aiExplanation = await (0, aiExplanationService_1.generateAiExplanation)(ctx);
    }
    catch (err) {
        const msg = (err === null || err === void 0 ? void 0 : err.message) || 'AI explanation generation failed';
        logger_1.logger.warn(`AI explanation failed for ${ctx.cardName}: ${msg}`);
        return res.status(503).json({ error: msg });
    }
    await new Promise((resolve, reject) => {
        db.run(`UPDATE card_predictions SET explanation = ? WHERE id = ?`, [aiExplanation, prediction.id], (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    res.json({ explanation: aiExplanation, cached: false });
}));
exports.default = router;
