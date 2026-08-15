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
const logger_1 = require("../../utils/logger");
const gradedPriceService_1 = require("../../services/gradedPriceService");
const gradedRefreshService_1 = require("../../services/gradedRefreshService");
const parseCsvParam_1 = require("./parseCsvParam");
const router = (0, express_1.Router)();
router.get('/graded-prices', async (req, res) => {
    try {
        const { cardId, cardName, setId, setName, cardNumber, language, matchName, variant, game, cardImageId } = req.query;
        if (!cardId || !cardName) {
            return res.status(400).json({ error: 'cardId and cardName are required' });
        }
        const result = await (0, gradedPriceService_1.getGradedPrices)(String(cardId), String(cardName), setId ? String(setId) : undefined, setName ? String(setName) : undefined, cardNumber ? String(cardNumber) : undefined, {
            language: language ? String(language) : undefined,
            matchName: matchName ? String(matchName) : undefined,
            variant: variant ? String(variant) : undefined,
            game: game === 'onepiece' || game === 'pokemon' ? game : undefined,
            cardImageId: cardImageId ? String(cardImageId) : undefined,
        });
        void (0, gradedRefreshService_1.recordGradedRequest)({
            cardId: String(cardId),
            cardName: String(cardName),
            setId: setId ? String(setId) : undefined,
            setName: setName ? String(setName) : undefined,
            cardNumber: cardNumber ? String(cardNumber) : undefined,
            language: language ? String(language) : undefined,
            matchName: matchName ? String(matchName) : undefined,
            variant: variant ? String(variant) : undefined,
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded prices lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded prices' });
    }
});
router.get('/graded-price-history', async (req, res) => {
    try {
        const cardId = req.query.cardId ? String(req.query.cardId) : '';
        const days = req.query.days ? parseInt(String(req.query.days), 10) : 365;
        const safeDays = Number.isFinite(days) ? days : 365;
        const variant = req.query.variant ? String(req.query.variant) : undefined;
        if (!cardId) {
            return res.status(400).json({ error: 'cardId is required' });
        }
        // Omit grader to fetch every series for a multi-line chart.
        if (!req.query.grader) {
            const all = await (0, gradedPriceService_1.getAllGradedPriceHistory)(cardId, safeDays, variant);
            return res.json({ data: all });
        }
        const grader = String(req.query.grader);
        const grade = req.query.grade ? String(req.query.grade) : '10';
        const result = await (0, gradedPriceService_1.getGradedPriceHistory)(cardId, grader, grade, safeDays, variant);
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded price history lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded price history' });
    }
});
router.get('/graded-spreads', async (req, res) => {
    try {
        const { getGradedSpreadsForCard, getTopGradedPremiums, getPsa10SpreadsForCards, } = await Promise.resolve().then(() => __importStar(require('../../services/gradedSpreadService')));
        const cardId = req.query.cardId ? String(req.query.cardId) : null;
        const variant = req.query.variant ? String(req.query.variant) : undefined;
        if (cardId) {
            const summary = await getGradedSpreadsForCard(cardId, variant);
            return res.json({ data: summary });
        }
        const cardIds = (0, parseCsvParam_1.parseCsvParam)(req.query.cardIds);
        if (cardIds && cardIds.length > 0) {
            const batch = await getPsa10SpreadsForCards(cardIds);
            return res.json({ data: batch, count: batch.length });
        }
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const tradeableOnly = String(req.query.tradeableOnly || '') === '1' ||
            String(req.query.tradeableOnly || '').toLowerCase() === 'true';
        const top = await getTopGradedPremiums(limit, { tradeableOnly });
        res.json({ data: top, count: top.length });
    }
    catch (error) {
        logger_1.logger.error('Graded spreads lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded spreads' });
    }
});
router.get('/graded-premium-movers', async (req, res) => {
    try {
        const { getTopPremiumMovers } = await Promise.resolve().then(() => __importStar(require('../../services/gradedSpreadService')));
        const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const movers = await getTopPremiumMovers({ days, limit });
        res.json({ data: movers, count: movers.length, days });
    }
    catch (error) {
        logger_1.logger.error('Graded premium movers lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch premium movers' });
    }
});
router.get('/cross-grader-arbs', async (req, res) => {
    try {
        const { getCrossGraderArbs } = await Promise.resolve().then(() => __importStar(require('../../services/gradedSpreadService')));
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const rows = await getCrossGraderArbs(limit);
        res.json({ data: rows, count: rows.length });
    }
    catch (error) {
        logger_1.logger.error('Cross-grader arb lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch cross-grader arbs' });
    }
});
/**
 * Cards most worth submitting for a PSA 10: high slab premium × easy gem rate.
 * Optional ?cardIds=a,b,c (or POST body) scopes to a vault / subset.
 */
router.get('/grade-worthiness', async (req, res) => {
    try {
        const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await Promise.resolve().then(() => __importStar(require('../../services/gradeWorthinessService')));
        const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
        const result = await getGradeWorthinessLeaderboard({
            limit,
            cardIds: (0, parseCsvParam_1.parseCsvParam)(req.query.cardIds),
            eras: (0, parseCsvParam_1.parseCsvParam)(req.query.eras),
            setIds: (0, parseCsvParam_1.parseCsvParam)(req.query.setIds),
            sort: parseGradeWorthinessSort(req.query.sort),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade worthiness lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade worthiness' });
    }
});
router.post('/grade-worthiness', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await Promise.resolve().then(() => __importStar(require('../../services/gradeWorthinessService')));
        const limit = Math.min(parseInt(String(req.query.limit || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || '40'), 10) || 40, 200);
        const result = await getGradeWorthinessLeaderboard({
            limit,
            cardIds: (0, parseCsvParam_1.parseCsvParam)((_b = req.body) === null || _b === void 0 ? void 0 : _b.cardIds),
            eras: (0, parseCsvParam_1.parseCsvParam)((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.eras) !== null && _d !== void 0 ? _d : req.query.eras),
            setIds: (0, parseCsvParam_1.parseCsvParam)((_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.setIds) !== null && _f !== void 0 ? _f : req.query.setIds),
            sort: parseGradeWorthinessSort((_h = (_g = req.body) === null || _g === void 0 ? void 0 : _g.sort) !== null && _h !== void 0 ? _h : req.query.sort),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade worthiness lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade worthiness' });
    }
});
/**
 * Submit vs buy PSA 10 decision engine.
 */
router.get('/submit-vs-buy', async (req, res) => {
    try {
        const { getSubmitVsBuyLeaderboard } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
        const result = await getSubmitVsBuyLeaderboard({
            limit,
            cardIds: (0, parseCsvParam_1.parseCsvParam)(req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Submit vs buy lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch submit vs buy' });
    }
});
router.post('/submit-vs-buy', async (req, res) => {
    var _a, _b, _c;
    try {
        const { getSubmitVsBuyLeaderboard } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || '20'), 10) || 20, 100);
        const result = await getSubmitVsBuyLeaderboard({
            limit,
            cardIds: (0, parseCsvParam_1.parseCsvParam)((_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.cardIds) !== null && _c !== void 0 ? _c : req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Submit vs buy lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch submit vs buy' });
    }
});
/** Set-level slab heatmap / regime map */
router.get('/set-slab-heatmap', async (req, res) => {
    try {
        const { getSetSlabHeatmap } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 100);
        const minCards = Math.min(parseInt(String(req.query.minCards || '3'), 10) || 3, 50);
        const result = await getSetSlabHeatmap({ limit, minCards });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Set slab heatmap failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch set slab heatmap' });
    }
});
/** Population regime / pop-report radar */
router.get('/pop-regime', async (req, res) => {
    try {
        const { getPopRegimeRadar } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
        const result = await getPopRegimeRadar({ days, limit });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Pop regime radar failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch pop regime' });
    }
});
/** Full grade-ladder economics */
router.get('/grade-ladder', async (req, res) => {
    try {
        const { getGradeLadderLeaderboard } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '15'), 10) || 15, 50);
        const result = await getGradeLadderLeaderboard({
            limit,
            cardIds: (0, parseCsvParam_1.parseCsvParam)(req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade ladder lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade ladder' });
    }
});
/** Crack-and-regrade EV scanner */
router.get('/crack-regrade', async (req, res) => {
    try {
        const { getCrackRegradeScanner } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const result = await getCrackRegradeScanner(limit);
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Crack-regrade scanner failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch crack-regrade opportunities' });
    }
});
/** Mark-to-market for owned slab book lots */
router.post('/slab-marks', async (req, res) => {
    var _a;
    try {
        const { getSlabMarksForLots } = await Promise.resolve().then(() => __importStar(require('../../services/slabInsightsService')));
        const lots = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.lots) ? req.body.lots : [];
        const normalized = lots
            .map((l) => ({
            cardId: String((l === null || l === void 0 ? void 0 : l.cardId) || '').trim(),
            grader: String((l === null || l === void 0 ? void 0 : l.grader) || 'PSA').trim(),
            grade: String((l === null || l === void 0 ? void 0 : l.grade) || '10').trim(),
        }))
            .filter((l) => l.cardId);
        const marks = await getSlabMarksForLots(normalized);
        res.json({ data: marks, count: marks.length });
    }
    catch (error) {
        logger_1.logger.error('Slab marks lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch slab marks' });
    }
});
/**
 * Manually trigger the nightly slab-price + population refresh. One request per
 * card serves both tables; data is strictly matched against PriceCharting.
 * ?all=1 runs the full-catalog sweep instead of the priority queue.
 */
router.post('/refresh-graded-data', async (req, res) => {
    try {
        const { runGradedRefresh, runAllCardsRefresh } = await Promise.resolve().then(() => __importStar(require('../../services/gradedRefreshService')));
        const { withDbJobLock } = await Promise.resolve().then(() => __importStar(require('../../utils/dbJobLock')));
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const all = String(req.query.all || '') === '1';
        const result = await withDbJobLock('graded-refresh', () => (all ? runAllCardsRefresh({ limit, delayMs: 1000 }) : runGradedRefresh(limit)), { skipIfBusy: true });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded data refresh failed', { error: error.message });
        res.status(500).json({ error: 'Failed to refresh graded data' });
    }
});
exports.default = router;
