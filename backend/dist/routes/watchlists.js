"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWatchlistsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const apiResponse_1 = require("../utils/apiResponse");
const listTypeSchema = zod_1.z.enum(['watchlist', 'wishlist', 'tracked']);
const syncSchema = zod_1.z.object({
    body: zod_1.z.object({
        items: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.string(),
            cardId: zod_1.z.string(),
            cardName: zod_1.z.string(),
            game: zod_1.z.string().optional(),
            listType: listTypeSchema,
            priority: zod_1.z.string().optional(),
            targetPrice: zod_1.z.number().optional(),
            notes: zod_1.z.string().optional(),
            card: zod_1.z.record(zod_1.z.unknown()).optional(),
            addedAt: zod_1.z.string().optional(),
            initialPrice: zod_1.z.number().optional(),
        })),
        wipeListTypes: zod_1.z.array(listTypeSchema).optional(),
    }),
});
const upsertSchema = zod_1.z.object({
    body: zod_1.z.object({
        id: zod_1.z.string(),
        cardId: zod_1.z.string(),
        cardName: zod_1.z.string(),
        game: zod_1.z.string().optional(),
        listType: listTypeSchema,
        priority: zod_1.z.string().optional(),
        targetPrice: zod_1.z.number().optional(),
        notes: zod_1.z.string().optional(),
        card: zod_1.z.record(zod_1.z.unknown()).optional(),
    }),
});
const createWatchlistsRouter = (watchlistService) => {
    const router = (0, express_1.Router)();
    router.get('/', auth_1.authenticate, async (req, res) => {
        try {
            const listType = req.query.listType;
            const items = await watchlistService.getForUser(req.user.id, listType);
            (0, apiResponse_1.ok)(res, { items });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.post('/sync', auth_1.authenticate, (0, validation_1.validate)(syncSchema), async (req, res) => {
        try {
            const wipeTypes = (req.body.wipeListTypes || []);
            const items = req.body.items || [];
            if (items.length === 0 && wipeTypes.length > 0) {
                await watchlistService.wipeListTypes(req.user.id, wipeTypes);
                const remaining = await watchlistService.getForUser(req.user.id);
                return (0, apiResponse_1.ok)(res, { items: remaining, synced: 0 });
            }
            const synced = await watchlistService.syncForUser(req.user.id, items);
            (0, apiResponse_1.ok)(res, { items: synced, synced: synced.length });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.post('/', auth_1.authenticate, (0, validation_1.validate)(upsertSchema), async (req, res) => {
        try {
            const item = await watchlistService.upsert(req.user.id, req.body);
            (0, apiResponse_1.ok)(res, { item }, 201);
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.delete('/:cardId', auth_1.authenticate, async (req, res) => {
        try {
            const listType = req.query.listType || 'tracked';
            const game = req.query.game || 'pokemon';
            await watchlistService.remove(req.user.id, req.params.cardId, listType, game);
            (0, apiResponse_1.ok)(res, { deleted: true });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    return router;
};
exports.createWatchlistsRouter = createWatchlistsRouter;
