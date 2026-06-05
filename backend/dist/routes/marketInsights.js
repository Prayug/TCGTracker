"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const predictionEngine_1 = require("../services/predictionEngine");
const backtestEngine_1 = require("../services/backtestEngine");
const forwardTestTracker_1 = require("../services/forwardTestTracker");
const externalSignalService_1 = require("../services/externalSignalService");
const database_1 = require("../db/database");
const admin_1 = require("../middleware/admin");
const router = (0, express_1.Router)();
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Market insights route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
router.get('/predictions', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const category = req.query.category;
    const predictions = yield (0, predictionEngine_1.getLatestPredictions)(limit, category);
    res.json({
        data: predictions,
        count: predictions.length,
        modelVersion: '1.0.0',
    });
})));
router.get('/card/:cardId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cardId } = req.params;
    const db = (0, database_1.getDb)();
    const prediction = yield new Promise((resolve, reject) => {
        db.get(`       SELECT cp.*, cm.cardName, cm.setName, cm.setId, cm.cardNumber, cm.rarity,
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
    const result = yield new Promise((resolve, reject) => {
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
            expected7dReturn: prediction.expected_7d_return,
            expected30dReturn: prediction.expected_30d_return,
            expected90dReturn: prediction.expected_90d_return,
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
            status: result.status,
        } : null,
    });
})));
router.post('/run-predictions', admin_1.requireAdminUnlessDev, asyncHandler((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.info('Manual prediction run requested');
    const result = yield (0, predictionEngine_1.runPredictions)();
    res.status(202).json({
        success: true,
        runId: result.runId,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
        message: `Prediction run complete: ${result.succeeded} predictions generated, ${result.failed} skipped`,
    });
})));
router.post('/backtest', admin_1.requireAdminUnlessDev, asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { backtestDate, windowDays = 90, cardIds } = req.body;
    if (!backtestDate) {
        return res.status(400).json({ error: 'backtestDate is required (YYYY-MM-DD)' });
    }
    logger_1.logger.info(`Backtest requested for date ${backtestDate}, window ${windowDays} days`);
    const result = yield (0, backtestEngine_1.runBacktest)(backtestDate, windowDays, cardIds || undefined);
    res.json(result);
})));
router.get('/backtest-results', asyncHandler((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const results = yield (0, backtestEngine_1.getBacktestResults)();
    res.json({ data: results });
})));
router.get('/forward-test', asyncHandler((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const status = yield (0, forwardTestTracker_1.getForwardTestStatus)();
    res.json(status);
})));
router.post('/forward-test/update', admin_1.requireAdminUnlessDev, asyncHandler((_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, forwardTestTracker_1.updateActualResults)();
    res.json({ success: true, updated: result.updated });
})));
router.get('/external-signals/:cardId', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cardId } = req.params;
    const signals = yield (0, externalSignalService_1.getExternalSignalsForCard)(cardId);
    res.json({ data: signals });
})));
exports.default = router;
