"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const predictionEngine_1 = require("../services/predictionEngine");
const horizonSupport_1 = require("../services/horizonSupport");
const slabPredictionEngine_1 = require("../services/slabPredictionEngine");
const slabBacktestEngine_1 = require("../services/slabBacktestEngine");
const slabForwardTest_1 = require("../services/slabForwardTest");
const slabDataQuality_1 = require("../services/slabDataQuality");
const returnCalibration_1 = require("../services/returnCalibration");
const externalSignalService_1 = require("../services/externalSignalService");
const aiExplanationService_1 = require("../services/aiExplanationService");
const router = (0, express_1.Router)();
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Slab insights route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
router.get('/predictions', asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const category = req.query.category;
    const search = req.query.search;
    const sortBy = req.query.sortBy || 'return';
    const sortOrder = req.query.sortOrder || 'desc';
    const minPrice = req.query.minPrice !== undefined ? parseFloat(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? parseFloat(req.query.maxPrice) : undefined;
    const minConfidence = req.query.minConfidence !== undefined ? parseFloat(req.query.minConfidence) : undefined;
    const rarities = req.query.rarities
        ? req.query.rarities.split(',').map((r) => r.trim()).filter(Boolean)
        : undefined;
    const eras = req.query.eras
        ? req.query.eras.split(',').map((e) => e.trim()).filter(Boolean)
        : undefined;
    const setIds = req.query.setIds
        ? req.query.setIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    const releaseDateFrom = req.query.releaseDateFrom;
    const releaseDateTo = req.query.releaseDateTo;
    const windowParam = req.query.window || '90d';
    const window = (0, slabPredictionEngine_1.isPredictionWindow)(windowParam) ? windowParam : '90d';
    const horizonSupport = await (0, horizonSupport_1.getGradedHorizonSupportStatus)();
    const horizonDays = (0, horizonSupport_1.windowToHorizonDays)(window);
    let effectiveWindow = window;
    if (horizonSupport.unsupported.includes(horizonDays)) {
        const usable = [...horizonSupport.supported, ...horizonSupport.experimental];
        const fallback = [7, 30, 90].find((h) => usable.includes(h));
        if (fallback)
            effectiveWindow = `${fallback}d`;
    }
    const predictions = await (0, slabPredictionEngine_1.getLatestSlabPredictions)(limit, category, {
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
        game: 'pokemon',
    }, effectiveWindow);
    res.json({
        data: predictions,
        count: predictions.length,
        window: effectiveWindow,
        requestedWindow: window,
        horizonSupport,
        experimental: horizonSupport.experimental.includes((0, horizonSupport_1.windowToHorizonDays)(effectiveWindow)),
        modelVersion: slabPredictionEngine_1.SLAB_MODEL_VERSION,
    });
}));
router.get('/horizon-support', asyncHandler(async (_req, res) => {
    const horizonSupport = await (0, horizonSupport_1.getGradedHorizonSupportStatus)(true);
    res.json({ data: horizonSupport });
}));
router.get('/data-quality', asyncHandler(async (_req, res) => {
    const summary = await (0, slabDataQuality_1.getSlabDataQuality)();
    res.json({
        data: summary.checks,
        runAt: summary.runAt,
        passed: summary.passed,
        warned: summary.warned,
        failed: summary.failed,
    });
}));
router.get('/overview', asyncHandler(async (_req, res) => {
    const overview = await (0, slabPredictionEngine_1.getSlabOverview)();
    res.json(overview);
}));
router.get('/card/:cardId', asyncHandler(async (req, res) => {
    var _a, _b, _c, _d;
    const { cardId } = req.params;
    const prediction = await (0, slabPredictionEngine_1.getSlabCardPrediction)(cardId);
    if (!prediction) {
        return res.status(404).json({ error: 'No slab prediction found for this card' });
    }
    const result = await (0, slabPredictionEngine_1.getSlabPredictionResult)(prediction.id);
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
            variantKey: prediction.variant_key || 'psa10',
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
    logger_1.logger.info('Manual slab prediction run requested');
    const kick = (0, slabPredictionEngine_1.startSlabPredictionsInBackground)();
    const status = (0, slabPredictionEngine_1.getSlabPredictionRunStatus)();
    const message = kick.alreadyRunning
        ? 'A slab prediction run is already in progress. Scoring every PSA 10 with enough history.'
        : 'Scoring all PSA 10 slabs in the background. This can take a few minutes — keep this tab open.';
    res.status(202).json({
        success: true,
        running: true,
        alreadyRunning: kick.alreadyRunning,
        startedAt: status.startedAt,
        message,
    });
}));
router.get('/run-status', asyncHandler(async (_req, res) => {
    const status = (0, slabPredictionEngine_1.getSlabPredictionRunStatus)();
    res.json({
        running: status.running,
        startedAt: status.startedAt,
        last: status.last,
    });
}));
router.post('/backtest', asyncHandler(async (req, res) => {
    const { backtestDate, windowDays = 90, cardIds } = req.body;
    if (!backtestDate) {
        return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
    }
    logger_1.logger.info(`Slab backtest requested for date ${backtestDate}, window ${windowDays} days`);
    const result = await (0, slabBacktestEngine_1.runSlabBacktest)(backtestDate, windowDays, cardIds || undefined);
    res.json(result);
}));
router.get('/calibration/status', asyncHandler(async (_req, res) => {
    const models = await (0, returnCalibration_1.getCalibrationModels)();
    res.json({ data: (0, returnCalibration_1.getCalibrationStatus)(models) });
}));
router.get('/backtest-results', asyncHandler(async (_req, res) => {
    const results = await (0, slabBacktestEngine_1.getSlabBacktestResults)();
    res.json({ data: results });
}));
router.get('/forward-test', asyncHandler(async (_req, res) => {
    const status = await (0, slabForwardTest_1.getSlabForwardTestStatus)();
    res.json(status);
}));
router.post('/forward-test/update', asyncHandler(async (_req, res) => {
    const result = await (0, slabForwardTest_1.updateSlabActualResults)();
    res.json({ success: true, updated: result.updated });
}));
router.get('/external-signals/:cardId', asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const signals = await (0, externalSignalService_1.getExternalSignalsForCard)(cardId);
    res.json({ data: signals });
}));
router.get('/card/:cardId/explanation', asyncHandler(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { cardId } = req.params;
    const prediction = await (0, slabPredictionEngine_1.getSlabCardPrediction)(cardId);
    if (!prediction) {
        return res.status(404).json({ error: 'No slab prediction found for this card' });
    }
    const existingExplanation = (_a = prediction.explanation) !== null && _a !== void 0 ? _a : '';
    if ((0, aiExplanationService_1.isAiExplanation)(existingExplanation)) {
        return res.json({ explanation: existingExplanation, cached: true });
    }
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
        setAgeDays: (0, predictionEngine_1.computeSetAgeDays)(null),
    };
    let aiExplanation;
    try {
        aiExplanation = await (0, aiExplanationService_1.generateAiExplanation)(ctx);
    }
    catch (err) {
        const msg = (err === null || err === void 0 ? void 0 : err.message) || 'AI explanation generation failed';
        logger_1.logger.warn(`Slab AI explanation failed for ${ctx.cardName}: ${msg}`);
        return res.status(503).json({ error: msg });
    }
    await (0, slabPredictionEngine_1.updateSlabExplanation)(prediction.id, aiExplanation);
    res.json({ explanation: aiExplanation, cached: false });
}));
exports.default = router;
