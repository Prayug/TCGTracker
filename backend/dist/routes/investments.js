"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const investmentOpportunitiesService_1 = require("../services/investmentOpportunitiesService");
const router = (0, express_1.Router)();
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Investments route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
router.get('/movers', asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const directionParam = req.query.direction;
    const direction = directionParam === 'up' || directionParam === 'down' ? directionParam : undefined;
    const result = await (0, investmentOpportunitiesService_1.getSlabMovers)({ days, direction, limit });
    res.json({ data: result });
}));
router.get('/similar', asyncHandler(async (req, res) => {
    const cardId = req.query.cardId || undefined;
    const cardIds = req.query.cardIds
        ? req.query.cardIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
    if (!cardId && (!cardIds || cardIds.length === 0)) {
        return res.status(400).json({ error: 'cardId or cardIds is required' });
    }
    const days = req.query.days ? parseInt(req.query.days, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const result = await (0, investmentOpportunitiesService_1.getSimilarSlabs)({ cardId, cardIds, days, limit });
    res.json({ data: result });
}));
router.get('/buyouts', asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const result = await (0, investmentOpportunitiesService_1.scanBuyoutCandidates)({ days, limit });
    res.json({ data: result });
}));
router.get('/opportunities', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore, 10) : undefined;
    const result = await (0, investmentOpportunitiesService_1.getOpportunities)({ limit, minScore });
    res.json({ data: result });
}));
router.get('/external-factors', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const type = req.query.type || undefined;
    const direction = req.query.direction || undefined;
    const sort = req.query.sort || undefined;
    const result = await (0, investmentOpportunitiesService_1.getExternalFactorsGlobal)({ limit, type, direction, sort });
    res.json({ data: result });
}));
exports.default = router;
