"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const apiResponse_1 = require("../utils/apiResponse");
const tradeService_1 = require("../services/tradeService");
const router = (0, express_1.Router)();
const payloadSchema = zod_1.z.object({
    v: zod_1.z.literal(1),
    g: zod_1.z.enum(['pokemon', 'onepiece']),
    t: zod_1.z.string().max(120).optional(),
    a: zod_1.z.array(zod_1.z.unknown()).max(40),
    b: zod_1.z.array(zod_1.z.unknown()).max(40),
    ca: zod_1.z.number().min(0).max(1000000),
    cb: zod_1.z.number().min(0).max(1000000),
});
const upsertSchema = zod_1.z.object({
    body: zod_1.z.object({
        id: zod_1.z.string().optional(),
        title: zod_1.z.string().max(120).optional(),
        game: zod_1.z.enum(['pokemon', 'onepiece']),
        payload: payloadSchema,
        giveTotal: zod_1.z.number().min(0).max(10000000),
        getTotal: zod_1.z.number().min(0).max(10000000),
    }),
});
router.get('/public/:token', async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (!token || token.length < 6)
            return (0, apiResponse_1.fail)(res, 'Invalid share link', 400);
        const trade = await (0, tradeService_1.getTradeByShareToken)(token);
        if (!trade)
            return (0, apiResponse_1.fail)(res, 'Trade not found', 404);
        return (0, apiResponse_1.ok)(res, { trade: (0, tradeService_1.toClientTrade)(trade) });
    }
    catch (error) {
        return (0, apiResponse_1.fail)(res, error.message);
    }
});
router.get('/', auth_1.authenticate, async (req, res) => {
    try {
        const trades = await (0, tradeService_1.listTradesForUser)(req.user.id);
        return (0, apiResponse_1.ok)(res, { trades: trades.map(tradeService_1.toClientTrade) });
    }
    catch (error) {
        return (0, apiResponse_1.fail)(res, error.message);
    }
});
router.post('/', auth_1.authenticate, (0, validation_1.validate)(upsertSchema), async (req, res) => {
    try {
        const trade = await (0, tradeService_1.upsertTrade)({
            userId: req.user.id,
            id: req.body.id,
            title: req.body.title,
            game: req.body.game,
            payload: req.body.payload,
            giveTotal: req.body.giveTotal,
            getTotal: req.body.getTotal,
        });
        return (0, apiResponse_1.ok)(res, { trade: (0, tradeService_1.toClientTrade)(trade) }, 201);
    }
    catch (error) {
        return (0, apiResponse_1.fail)(res, error.message);
    }
});
router.delete('/:id', auth_1.authenticate, async (req, res) => {
    try {
        const removed = await (0, tradeService_1.deleteTrade)(req.user.id, req.params.id);
        if (!removed)
            return (0, apiResponse_1.fail)(res, 'Trade not found', 404);
        return (0, apiResponse_1.ok)(res, { deleted: true });
    }
    catch (error) {
        return (0, apiResponse_1.fail)(res, error.message);
    }
});
exports.default = router;
