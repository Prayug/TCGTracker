"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const setTrackerService_1 = require("../services/setTrackerService");
const router = (0, express_1.Router)();
const parseOwnedIds = (raw) => {
    if (typeof raw !== 'string' || !raw.trim())
        return new Set();
    return new Set(raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean));
};
/**
 * GET /api/cards/sets/:setId/cards — full set checklist with latest prices
 */
router.get('/sets/:setId/cards', async (req, res) => {
    try {
        const { setId } = req.params;
        if (!(setId === null || setId === void 0 ? void 0 : setId.trim())) {
            return res.status(400).json({ error: 'Set ID is required' });
        }
        const setMeta = await (0, setTrackerService_1.resolveSetMeta)(setId);
        if (!setMeta) {
            return res.status(404).json({ error: 'Set not found', setId });
        }
        const rows = await (0, setTrackerService_1.fetchSetCatalogRows)(setId);
        const cards = rows.map((row) => (0, setTrackerService_1.rowToSetCardDto)(row, setMeta));
        const ownedIds = parseOwnedIds(req.query.ownedIds);
        const data = cards.map((card) => ({
            ...card,
            owned: ownedIds.has(card.id),
        }));
        res.json({
            set: setMeta,
            data,
            count: data.length,
            source: 'catalog',
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching set cards:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * GET /api/cards/sets/:setId/summary — completion and value metrics
 * Query: ownedIds (comma-separated card IDs from vault)
 */
router.get('/sets/:setId/summary', async (req, res) => {
    try {
        const { setId } = req.params;
        if (!(setId === null || setId === void 0 ? void 0 : setId.trim())) {
            return res.status(400).json({ error: 'Set ID is required' });
        }
        const setMeta = await (0, setTrackerService_1.resolveSetMeta)(setId);
        if (!setMeta) {
            return res.status(404).json({ error: 'Set not found', setId });
        }
        const rows = await (0, setTrackerService_1.fetchSetCatalogRows)(setId);
        const cards = rows.map((row) => (0, setTrackerService_1.rowToSetCardDto)(row, setMeta));
        const ownedIds = parseOwnedIds(req.query.ownedIds);
        const wishlistIds = parseOwnedIds(req.query.wishlistIds);
        const summary = (0, setTrackerService_1.computeSetSummary)(cards, ownedIds, wishlistIds);
        res.json({ set: setMeta, summary });
    }
    catch (error) {
        logger_1.logger.error('Error fetching set summary:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * GET /api/cards/sets/:setId/value-history — aggregated set value over time
 * Query: range = 30d | 90d | 1y | all
 */
router.get('/sets/:setId/value-history', async (req, res) => {
    try {
        const { setId } = req.params;
        const range = req.query.range || '90d';
        const validRanges = ['30d', '90d', '1y', 'all'];
        if (!(setId === null || setId === void 0 ? void 0 : setId.trim())) {
            return res.status(400).json({ error: 'Set ID is required' });
        }
        if (!validRanges.includes(range)) {
            return res.status(400).json({
                error: 'Invalid range',
                valid: validRanges,
            });
        }
        const setMeta = await (0, setTrackerService_1.resolveSetMeta)(setId);
        if (!setMeta) {
            return res.status(404).json({ error: 'Set not found', setId });
        }
        const history = await (0, setTrackerService_1.fetchSetValueHistory)(setId, range);
        res.json({
            setId: setMeta.id,
            setName: setMeta.name,
            range,
            data: history,
            count: history.length,
            disclaimer: 'Values sum cards with price history only; sparse dates use last-known price carry-forward.',
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching set value history:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
exports.default = router;
