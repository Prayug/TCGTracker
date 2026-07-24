"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBinderRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_1 = require("../db/database");
const binderPlannerService_1 = require("../services/binderPlannerService");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const slotInputSchema = zod_1.z.object({
    pageNumber: zod_1.z.number().int().positive().default(1),
    slotPosition: zod_1.z.number().int().min(0).max(8),
    cardId: zod_1.z.string(),
    cardSnapshot: zod_1.z.string().optional(),
    marketPriceCents: zod_1.z.number().int().optional(),
    notes: zod_1.z.string().optional(),
});
const createBinderSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().optional(),
        game: zod_1.z.enum(['pokemon', 'onepiece']).optional().default('pokemon'),
        pages: zod_1.z.number().int().positive().optional().default(1),
        slotsPerPage: zod_1.z.number().int().positive().optional().default(9),
        themeDescription: zod_1.z.string().optional(),
        budgetCents: zod_1.z.number().int().optional(),
        constraintsJson: zod_1.z.string().optional(),
        slots: zod_1.z.array(slotInputSchema).optional(),
    }),
});
const planSchema = zod_1.z.object({
    body: zod_1.z.object({
        prompt: zod_1.z.string().min(1, 'Prompt is required'),
        budgetDollars: zod_1.z.number().positive().optional(),
        pokemonTypes: zod_1.z.array(zod_1.z.string()).optional(),
        rarityPreferences: zod_1.z.array(zod_1.z.string()).optional(),
        eraBias: zod_1.z.string().optional(),
        specificSets: zod_1.z.array(zod_1.z.string()).optional(),
        excludeSets: zod_1.z.array(zod_1.z.string()).optional(),
        themeKeywords: zod_1.z.array(zod_1.z.string()).optional(),
        compositionRules: zod_1.z.array(zod_1.z.string()).optional(),
        maxSingleCardPrice: zod_1.z.number().optional(),
    }),
});
const updateSlotSchema = zod_1.z.object({
    body: zod_1.z.object({
        cardId: zod_1.z.string().optional(),
        cardSnapshot: zod_1.z.string().optional(),
        marketPriceCents: zod_1.z.number().int().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Binder route error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    });
};
const createBinderRouter = (binderService) => {
    // Planning is public (matches vault/wishlist guest UX). Saving binders still requires auth.
    router.post('/plan', auth_1.optionalAuth, (0, validation_1.validate)(planSchema), asyncHandler(async (req, res) => {
        var _a, _b;
        const db = (0, database_1.getDb)();
        const plan = await (0, binderPlannerService_1.generateBinderPlan)(db, (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : 0, req.body.prompt, {
            budgetDollars: req.body.budgetDollars,
            pokemonTypes: req.body.pokemonTypes,
            rarityPreferences: req.body.rarityPreferences,
            eraBias: req.body.eraBias,
            specificSets: req.body.specificSets,
            excludeSets: req.body.excludeSets,
            themeKeywords: req.body.themeKeywords,
            compositionRules: req.body.compositionRules,
            maxSingleCardPrice: req.body.maxSingleCardPrice != null
                ? Math.round(req.body.maxSingleCardPrice * 100)
                : undefined,
        });
        res.json({ plan });
    }));
    router.get('/plan/constraints', asyncHandler(async (_req, res) => {
        res.json({
            themes: [
                { id: 'warm', label: 'Warm', types: ['Fire', 'Fighting', 'Lightning'] },
                { id: 'sunny', label: 'Sunny', types: ['Fire', 'Lightning', 'Grass'] },
                { id: 'icy', label: 'Icy', types: ['Water', 'Psychic'] },
                { id: 'cool', label: 'Cool', types: ['Water', 'Psychic', 'Darkness'] },
                { id: 'earthy', label: 'Earthy', types: ['Grass', 'Fighting'] },
                { id: 'colorful', label: 'Colorful', types: ['Psychic', 'Fairy', 'Dragon'] },
                { id: 'dark', label: 'Dark', types: ['Darkness', 'Psychic', 'Metal'] },
                { id: 'pastel', label: 'Pastel', types: ['Fairy', 'Psychic', 'Grass'] },
                { id: 'neon', label: 'Neon', types: ['Lightning', 'Psychic', 'Fire'] },
                { id: 'nature', label: 'Nature', types: ['Grass', 'Water', 'Fighting'] },
                { id: 'mystic', label: 'Mystic', types: ['Psychic', 'Darkness', 'Dragon'] },
                { id: 'royal', label: 'Royal', types: ['Psychic', 'Metal', 'Fairy'] },
            ],
            pokemonTypes: [
                'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting',
                'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless',
            ],
            rarities: [
                'Common', 'Uncommon', 'Rare', 'Holo', 'Reverse Holo',
                'V', 'VMAX', 'VSTAR', 'Full Art', 'Alternate Art',
                'Secret Rare', 'Ultra Rare', 'Trainer Gallery', 'Radiant', 'Rainbow',
            ],
            compositionRules: [
                { id: 'no_duplicate_names', label: 'No Duplicate Pokémon' },
                { id: 'at_least_2_v', label: 'At Least 2 V/VMAX/VSTAR' },
                { id: 'at_least_1_full_art', label: 'At Least 1 Full Art' },
                { id: 'mix_of_types', label: 'Mix of Types' },
                { id: 'all_same_type', label: 'All Same Type' },
                { id: 'all_different_types', label: 'All Different Types' },
                { id: 'single_evolution_line', label: 'Single Evolution Line' },
            ],
        });
    }));
    router.get('/', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binders = await binderService.listBinders(req.user.id);
        const bindersWithSlots = await Promise.all(binders.map(b => binderService.getBinderWithSlots(b.id, req.user.id)));
        res.json({ binders: bindersWithSlots.filter(Boolean) });
    }));
    router.get('/:id', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        const binder = await binderService.getBinderWithSlots(binderId, req.user.id);
        if (!binder) {
            return res.status(404).json({ error: 'Binder not found' });
        }
        res.json({ binder });
    }));
    router.post('/', auth_1.authenticate, (0, validation_1.validate)(createBinderSchema), asyncHandler(async (req, res) => {
        var _a;
        const slots = (_a = req.body.slots) === null || _a === void 0 ? void 0 : _a.map((s) => ({
            page_number: s.pageNumber,
            slot_position: s.slotPosition,
            card_id: s.cardId,
            card_snapshot: s.cardSnapshot,
            market_price_cents: s.marketPriceCents,
            notes: s.notes,
        }));
        const binder = await binderService.createBinder(req.user.id, {
            name: req.body.name,
            game: req.body.game,
            pages: req.body.pages,
            slots_per_page: req.body.slotsPerPage,
            theme_description: req.body.themeDescription,
            budget_cents: req.body.budgetCents,
            constraints_json: req.body.constraintsJson,
        }, slots);
        res.status(201).json({ binder });
    }));
    router.put('/:id', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        await binderService.updateBinder(binderId, req.user.id, req.body);
        const binder = await binderService.getBinder(binderId, req.user.id);
        if (!binder)
            return res.status(404).json({ error: 'Binder not found' });
        res.json({ binder });
    }));
    router.delete('/:id', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        await binderService.deleteBinder(binderId, req.user.id);
        res.json({ success: true });
    }));
    router.post('/:id/commit/vault', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        const count = await binderService.commitToVault(binderId, req.user.id);
        res.json({ success: true, cardsAdded: count });
    }));
    router.post('/:id/commit/wishlist', auth_1.authenticate, asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        const slots = await binderService.commitToWishlist(binderId, req.user.id);
        const cards = slots.map(s => ({
            cardId: s.card_id,
            cardSnapshot: s.card_snapshot ? JSON.parse(s.card_snapshot) : null,
            marketPrice: s.market_price_cents ? s.market_price_cents / 100 : null,
        }));
        res.json({ success: true, cards });
    }));
    router.put('/:id/slots/:slotId', auth_1.authenticate, (0, validation_1.validate)(updateSlotSchema), asyncHandler(async (req, res) => {
        const binderId = parseInt(req.params.id, 10);
        const slotId = parseInt(req.params.slotId, 10);
        const slot = await binderService.getSlot(slotId);
        if (!slot || slot.binder_id !== binderId) {
            return res.status(404).json({ error: 'Slot not found in this binder' });
        }
        await binderService.updateSlot(slotId, binderId, req.user.id, {
            card_id: req.body.cardId,
            card_snapshot: req.body.cardSnapshot,
            market_price_cents: req.body.marketPriceCents,
            notes: req.body.notes,
        });
        const binder = await binderService.getBinderWithSlots(binderId, req.user.id);
        res.json({ binder });
    }));
    router.post('/:id/refresh', auth_1.authenticate, asyncHandler(async (req, res) => {
        var _a;
        const binderId = parseInt(req.params.id, 10);
        const binder = await binderService.getBinder(binderId, req.user.id);
        if (!binder)
            return res.status(404).json({ error: 'Binder not found' });
        const db = (0, database_1.getDb)();
        const plan = await (0, binderPlannerService_1.generateBinderPlan)(db, req.user.id, binder.theme_description || '', binder.constraints_json ? JSON.parse(binder.constraints_json) : {});
        await binderService.updateBinder(binderId, req.user.id, {
            total_cost_cents: plan.totalCost,
        });
        for (let i = 0; i < plan.slots.length; i++) {
            const slot = plan.slots[i];
            const existingSlot = (_a = (await binderService.getBinderWithSlots(binderId, req.user.id))) === null || _a === void 0 ? void 0 : _a.slots[i];
            if (existingSlot) {
                await binderService.updateSlot(existingSlot.id, binderId, req.user.id, {
                    card_id: slot.cardId,
                    card_snapshot: JSON.stringify(slot),
                    market_price_cents: slot.marketPrice ? Math.round(slot.marketPrice * 100) : null,
                });
            }
        }
        const updated = await binderService.getBinderWithSlots(binderId, req.user.id);
        res.json({ binder: updated, plan });
    }));
    return router;
};
exports.createBinderRouter = createBinderRouter;
exports.default = router;
