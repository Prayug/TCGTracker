"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortfolioRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const apiResponse_1 = require("../utils/apiResponse");
const router = (0, express_1.Router)();
const addToCollectionSchema = zod_1.z.object({
    body: zod_1.z.object({
        cardId: zod_1.z.string(),
        cardName: zod_1.z.string(),
        quantity: zod_1.z.number().int().positive().default(1),
        purchasePrice: zod_1.z.number().optional(),
        purchaseDate: zod_1.z.string().optional(),
        condition: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        cardData: zod_1.z.string().optional(),
        clientVaultId: zod_1.z.string().optional(),
    }),
});
const updateItemSchema = zod_1.z.object({
    body: zod_1.z.object({
        quantity: zod_1.z.number().int().positive().optional(),
        purchasePrice: zod_1.z.number().optional(),
        condition: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
        cardData: zod_1.z.string().optional(),
    }),
});
const syncVaultSchema = zod_1.z.object({
    body: zod_1.z.object({
        cards: zod_1.z.array(zod_1.z.object({
            id: zod_1.z.string(),
            card: zod_1.z.record(zod_1.z.unknown()),
            purchasePrice: zod_1.z.coerce.number(),
            purchaseDate: zod_1.z.string(),
            quantity: zod_1.z.coerce.number().int().positive(),
            condition: zod_1.z.string(),
            notes: zod_1.z.string().nullish(),
            gradingResult: zod_1.z.unknown().optional(),
            game: zod_1.z.string().optional(),
        })),
    }),
});
const createPortfolioRouter = (portfolioService) => {
    router.get('/', auth_1.authenticate, async (req, res) => {
        try {
            const collection = await portfolioService.getCollection(req.user.id);
            (0, apiResponse_1.ok)(res, { collection });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.get('/stats', auth_1.authenticate, async (req, res) => {
        try {
            const stats = await portfolioService.getPortfolioStats(req.user.id);
            (0, apiResponse_1.ok)(res, { stats });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.get('/lots', auth_1.authenticate, async (req, res) => {
        try {
            const openOnly = req.query.openOnly === 'true';
            const lots = await portfolioService.getLots(req.user.id, openOnly);
            (0, apiResponse_1.ok)(res, { lots });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.post('/lots/:id/close', auth_1.authenticate, async (req, res) => {
        var _a, _b;
        try {
            const lotId = parseInt(req.params.id, 10);
            const salePrice = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.salePrice);
            if (!Number.isFinite(salePrice) || salePrice < 0) {
                return (0, apiResponse_1.fail)(res, 'salePrice is required', 400);
            }
            const lot = await portfolioService.closeLot(req.user.id, lotId, salePrice, (_b = req.body) === null || _b === void 0 ? void 0 : _b.soldAt);
            if (!lot)
                return (0, apiResponse_1.fail)(res, 'Lot not found', 404);
            (0, apiResponse_1.ok)(res, { lot });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.post('/sync', auth_1.authenticate, (0, validation_1.validate)(syncVaultSchema), async (req, res) => {
        try {
            const collection = await portfolioService.syncVault(req.user.id, req.body.cards);
            (0, apiResponse_1.ok)(res, { collection, synced: collection.length });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.post('/', auth_1.authenticate, (0, validation_1.validate)(addToCollectionSchema), async (req, res) => {
        try {
            const { cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes, cardData, clientVaultId } = req.body;
            const item = await portfolioService.addToCollection(req.user.id, cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes, cardData, clientVaultId);
            (0, apiResponse_1.ok)(res, { item }, 201);
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.put('/:id', auth_1.authenticate, (0, validation_1.validate)(updateItemSchema), async (req, res) => {
        try {
            const itemId = parseInt(req.params.id, 10);
            await portfolioService.updateItem(itemId, req.user.id, req.body);
            (0, apiResponse_1.ok)(res, { updated: true });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    router.delete('/:id', auth_1.authenticate, async (req, res) => {
        try {
            const itemId = parseInt(req.params.id, 10);
            await portfolioService.removeFromCollection(itemId, req.user.id);
            (0, apiResponse_1.ok)(res, { deleted: true });
        }
        catch (error) {
            (0, apiResponse_1.fail)(res, error.message);
        }
    });
    return router;
};
exports.createPortfolioRouter = createPortfolioRouter;
