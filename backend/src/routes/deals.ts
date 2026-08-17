import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import { fail, ok } from '../utils/apiResponse';
import {
  dismissDeal,
  getDeals,
  getDealsForCard,
  listSavedDeals,
  saveDeal,
  unsaveDeal,
  type DealGame,
  type DealQuery,
  type DealSort,
} from '../services/ebayDealService';

const router = Router();

const gameSchema = z.enum(['pokemon', 'onepiece']);
const sortSchema = z.enum(['best', 'discount_pct', 'savings', 'price', 'market', 'ending']);

const querySchema = z.object({
  game: gameSchema.optional(),
  type: z.enum(['all', 'raw', 'graded']).optional(),
  listingType: z.enum(['all', 'bin', 'auction']).optional(),
  minDiscount: z.coerce.number().min(0).max(100).optional(),
  minSavings: z.coerce.number().min(0).optional(),
  minMarketValue: z.coerce.number().min(0).optional(),
  gradingCompany: z.string().optional(),
  grade: z.string().optional(),
  set: z.string().optional(),
  rarity: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  freeShipping: z.enum(['1', 'true', '0', 'false']).optional(),
  language: z.enum(['en', 'ja']).optional(),
  sort: sortSchema.optional(),
  cardId: z.string().optional(),
  desiredAuctionMargin: z.coerce.number().min(0).max(90).optional(),
  refresh: z.enum(['1', 'true', '0', 'false']).optional(),
});

function parseQuery(req: AuthRequest): DealQuery {
  const parsed = querySchema.parse(req.query);
  return {
    game: (parsed.game || 'pokemon') as DealGame,
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
    sort: (parsed.sort || 'best') as DealSort,
    desiredAuctionMargin: parsed.desiredAuctionMargin,
    refresh: parsed.refresh === '1' || parsed.refresh === 'true',
  };
}

const asyncHandler = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: AuthRequest, res: Response) => {
    fn(req, res).catch((err: Error) => {
      logger.error('Deals route error', { error: err.message });
      fail(res, err.message, 500);
    });
  };

router.get(
  '/saved',
  authenticate,
  asyncHandler(async (req, res) => {
    const game = typeof req.query.game === 'string' ? req.query.game : undefined;
    if (game && game !== 'pokemon' && game !== 'onepiece') {
      return fail(res, 'Invalid game', 400);
    }
    const deals = await listSavedDeals(req.user!.id, game as DealGame | undefined);
    return ok(res, { deals });
  })
);

router.get(
  '/card/:cardId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const query = parseQuery(req);
    const result = await getDealsForCard(req.params.cardId, query);
    return ok(res, result);
  })
);

router.post(
  '/:listingId/save',
  authenticate,
  asyncHandler(async (req, res) => {
    const listingId = decodeURIComponent(req.params.listingId);
    const body = z
      .object({
        game: gameSchema,
        cardId: z.string().min(1),
        uniqueIdentifier: z.string().min(1),
        listingUrl: z.string().url(),
        listingPrice: z.number().nonnegative(),
        shippingPrice: z.number().nonnegative(),
        marketPriceSnapshot: z.number().positive(),
        discountPercentSnapshot: z.number(),
        matchConfidence: z.number().min(0).max(1),
        listingEndTime: z.string().nullable().optional(),
      })
      .parse(req.body);
    const saved = await saveDeal(req.user!.id, listingId, body);
    return ok(res, { deal: saved }, 201);
  })
);

router.delete(
  '/:listingId/save',
  authenticate,
  asyncHandler(async (req, res) => {
    const listingId = decodeURIComponent(req.params.listingId);
    const removed = await unsaveDeal(req.user!.id, listingId);
    if (!removed) return fail(res, 'Saved deal not found', 404);
    return ok(res, { deleted: true });
  })
);

router.post(
  '/:listingId/dismiss',
  authenticate,
  asyncHandler(async (req, res) => {
    const listingId = decodeURIComponent(req.params.listingId);
    const game = gameSchema.parse(req.body?.game || req.query.game || 'pokemon');
    await dismissDeal(req.user!.id, listingId, game);
    return ok(res, { dismissed: true });
  })
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return fail(res, 'Invalid deals query', 400);
    const query = parseQuery(req);
    const result = await getDeals(query, req.user?.id);
    return ok(res, result);
  })
);

export default router;
