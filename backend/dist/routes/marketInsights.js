"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const predictionEngine_1 = require("../services/predictionEngine");
const backtestEngine_1 = require("../services/backtestEngine");
const forwardTestTracker_1 = require("../services/forwardTestTracker");
const externalSignalService_1 = require("../services/externalSignalService");
const scraperRunner_1 = require("../services/scrapers/scraperRunner");
const aiExplanationService_1 = require("../services/aiExplanationService");
const database_1 = require("../db/database");
const router = (0, express_1.Router)();
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Market insights route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
router.get('/predictions', asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const category = req.query.category;
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
    const windowParam = req.query.window || '90d';
    const window = (0, predictionEngine_1.isPredictionWindow)(windowParam) ? windowParam : '90d';
    const predictions = await (0, predictionEngine_1.getLatestPredictions)(limit, category, {
        minPrice,
        maxPrice,
        minConfidence,
        rarities,
        eras,
        setIds,
        releaseDateFrom,
        releaseDateTo,
    }, window);
    res.json({
        data: predictions,
        count: predictions.length,
        window,
        modelVersion: '3.1.0',
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
                 MIN(COALESCE(NULLIF(imageLarge, ''), NULLIF(image_large, ''))) AS imageLarge,
                 MIN(COALESCE(NULLIF(imageSmall, ''), NULLIF(image_small, ''))) AS imageSmall,
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
router.post('/run-predictions', asyncHandler(async (_req, res) => {
    logger_1.logger.info('Manual prediction run requested');
    const result = await (0, predictionEngine_1.runPredictions)();
    res.status(202).json({
        success: true,
        runId: result.runId,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        message: `Prediction run complete: ${result.succeeded} predictions generated, ${result.failed} skipped`,
    });
}));
router.post('/backtest', asyncHandler(async (req, res) => {
    const { backtestDate, windowDays = 90, cardIds } = req.body;
    if (!backtestDate) {
        return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
    }
    logger_1.logger.info(`Backtest requested for date ${backtestDate}, window ${windowDays} days`);
    const result = await (0, backtestEngine_1.runBacktest)(backtestDate, windowDays, cardIds || undefined);
    res.json(result);
}));
router.get('/backtest-results', asyncHandler(async (_req, res) => {
    const results = await (0, backtestEngine_1.getBacktestResults)();
    res.json({ data: results });
}));
router.get('/forward-test', asyncHandler(async (_req, res) => {
    const status = await (0, forwardTestTracker_1.getForwardTestStatus)();
    res.json(status);
}));
router.post('/forward-test/update', asyncHandler(async (_req, res) => {
    const result = await (0, forwardTestTracker_1.updateActualResults)();
    res.json({ success: true, updated: result.updated });
}));
router.get('/external-signals/:cardId', asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const signals = await (0, externalSignalService_1.getExternalSignalsForCard)(cardId);
    res.json({ data: signals });
}));
router.post('/run-scrape', asyncHandler(async (_req, res) => {
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
