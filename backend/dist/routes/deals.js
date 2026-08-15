"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const logger_1 = require("../utils/logger");
const apiResponse_1 = require("../utils/apiResponse");
const ebayDealService_1 = require("../services/ebayDealService");
const router = (0, express_1.Router)();
const gameSchema = zod_1.z.enum(['pokemon', 'onepiece']);
const sortSchema = zod_1.z.enum(['best', 'discount_pct', 'savings', 'price', 'market', 'ending']);
const querySchema = zod_1.z.object({
    game: gameSchema.optional(),
    type: zod_1.z.enum(['all', 'raw', 'graded']).optional(),
    listingType: zod_1.z.enum(['all', 'bin', 'auction']).optional(),
    minDiscount: zod_1.z.coerce.number().min(0).max(100).optional(),
    minSavings: zod_1.z.coerce.number().min(0).optional(),
    minMarketValue: zod_1.z.coerce.number().min(0).optional(),
    gradingCompany: zod_1.z.string().optional(),
    grade: zod_1.z.string().optional(),
    set: zod_1.z.string().optional(),
    rarity: zod_1.z.string().optional(),
    minPrice: zod_1.z.coerce.number().min(0).optional(),
    maxPrice: zod_1.z.coerce.number().min(0).optional(),
    freeShipping: zod_1.z.enum(['1', 'true', '0', 'false']).optional(),
    language: zod_1.z.enum(['en', 'ja']).optional(),
    sort: sortSchema.optional(),
    cardId: zod_1.z.string().optional(),
    desiredAuctionMargin: zod_1.z.coerce.number().min(0).max(90).optional(),
    refresh: zod_1.z.enum(['1', 'true', '0', 'false']).optional(),
});
function parseQuery(req) {
    const parsed = querySchema.parse(req.query);
    return {
        game: (parsed.game || 'pokemon'),
        cardId: parsed.cardId,
        condition: parsed.type || 'all',
        listingType: parsed.listingType || 'all',
        minDiscount: parsed.minDiscount,
        minSavings: parsed.minSavings,
        minMarketValue: parsed.minMarketValue,
        gradingCompany: parsed.gradingCompany,
        grade: parsed.grade,
        set: parsed.set,
        rarity: parsed.rarity,
        minPrice: parsed.minPrice,
        maxPrice: parsed.maxPrice,
        freeShipping: parsed.freeShipping === '1' || parsed.freeShipping === 'true',
        language: parsed.language,
        sort: (parsed.sort || 'best'),
        desiredAuctionMargin: parsed.desiredAuctionMargin,
        refresh: parsed.refresh === '1' || parsed.refresh === 'true',
    };
}
const asyncHandler = (fn) => (req, res) => {
    fn(req, res).catch((err) => {
        logger_1.logger.error('Deals route error', { error: err.message });
        (0, apiResponse_1.fail)(res, err.message, 500);
    });
};
router.get('/saved', auth_1.authenticate, asyncHandler(async (req, res) => {
    const game = typeof req.query.game === 'string' ? req.query.game : undefined;
    if (game && game !== 'pokemon' && game !== 'onepiece') {
        return (0, apiResponse_1.fail)(res, 'Invalid game', 400);
    }
    const deals = await (0, ebayDealService_1.listSavedDeals)(req.user.id, game);
    return (0, apiResponse_1.ok)(res, { deals });
}));
router.get('/card/:cardId', auth_1.optionalAuth, asyncHandler(async (req, res) => {
    const query = parseQuery(req);
    const result = await (0, ebayDealService_1.getDealsForCard)(req.params.cardId, query);
    return (0, apiResponse_1.ok)(res, result);
}));
router.post('/:listingId/save', auth_1.authenticate, asyncHandler(async (req, res) => {
    const listingId = decodeURIComponent(req.params.listingId);
    const body = zod_1.z
        .object({
        game: gameSchema,
        cardId: zod_1.z.string().min(1),
        uniqueIdentifier: zod_1.z.string().min(1),
        listingUrl: zod_1.z.string().url(),
        listingPrice: zod_1.z.number().nonnegative(),
        shippingPrice: zod_1.z.number().nonnegative(),
        marketPriceSnapshot: zod_1.z.number().positive(),
        discountPercentSnapshot: zod_1.z.number(),
        matchConfidence: zod_1.z.number().min(0).max(1),
        listingEndTime: zod_1.z.string().nullable().optional(),
    })
        .parse(req.body);
    const saved = await (0, ebayDealService_1.saveDeal)(req.user.id, listingId, body);
    return (0, apiResponse_1.ok)(res, { deal: saved }, 201);
}));
router.delete('/:listingId/save', auth_1.authenticate, asyncHandler(async (req, res) => {
    const listingId = decodeURIComponent(req.params.listingId);
    const removed = await (0, ebayDealService_1.unsaveDeal)(req.user.id, listingId);
    if (!removed)
        return (0, apiResponse_1.fail)(res, 'Saved deal not found', 404);
    return (0, apiResponse_1.ok)(res, { deleted: true });
}));
router.post('/:listingId/dismiss', auth_1.authenticate, asyncHandler(async (req, res) => {
    var _a;
    const listingId = decodeURIComponent(req.params.listingId);
    const game = gameSchema.parse(((_a = req.body) === null || _a === void 0 ? void 0 : _a.game) || req.query.game || 'pokemon');
    await (0, ebayDealService_1.dismissDeal)(req.user.id, listingId, game);
    return (0, apiResponse_1.ok)(res, { dismissed: true });
}));
router.get('/', auth_1.optionalAuth, asyncHandler(async (req, res) => {
    var _a;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success)
        return (0, apiResponse_1.fail)(res, 'Invalid deals query', 400);
    const query = parseQuery(req);
    const result = await (0, ebayDealService_1.getDeals)(query, (_a = req.user) === null || _a === void 0 ? void 0 : _a.id);
    return (0, apiResponse_1.ok)(res, result);
}));
exports.default = router;
