import { Router, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { optionalAuth, AuthRequest } from '../middleware/auth';
import { fail, ok } from '../utils/apiResponse';
import {
  getSlabMovers,
  getSimilarSlabs,
  scanBuyoutCandidates,
  getOpportunities,
  getExternalFactorsGlobal,
  type MoverDirection,
} from '../services/investmentOpportunitiesService';
import { getCardCheck, getStrategyReport } from '../services/strategyBacktest/service';
import {
  getInvestmentEbayListings,
  type DealGame,
  type DealQuery,
  type DealSort,
} from '../services/ebayDealService';

const router = Router();

const asyncHandler =
  (fn: (req: AuthRequest, res: Response) => Promise<any>) => (req: AuthRequest, res: Response) => {
    fn(req, res).catch((err: any) => {
      logger.error('Investments route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };

router.get(
  '/movers',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const directionParam = req.query.direction as string | undefined;
    const direction: MoverDirection | undefined =
      directionParam === 'up' || directionParam === 'down' ? directionParam : undefined;
    const result = await getSlabMovers({ days, direction, limit });
    res.json({ data: result });
  })
);

router.get(
  '/similar',
  asyncHandler(async (req, res) => {
    const cardId = (req.query.cardId as string) || undefined;
    const cardIds = req.query.cardIds
      ? (req.query.cardIds as string)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    if (!cardId && (!cardIds || cardIds.length === 0)) {
      return res.status(400).json({ error: 'cardId or cardIds is required' });
    }
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = await getSimilarSlabs({ cardId, cardIds, days, limit });
    res.json({ data: result });
  })
);

router.get(
  '/buyouts',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = await scanBuyoutCandidates({ days, limit });
    res.json({ data: result });
  })
);

router.get(
  '/opportunities',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string, 10) : undefined;
    const result = await getOpportunities({ limit, minScore });
    res.json({ data: result });
  })
);

router.get(
  '/external-factors',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const type = (req.query.type as string) || undefined;
    const direction = (req.query.direction as string) || undefined;
    const sort = (req.query.sort as string) || undefined;
    const result = await getExternalFactorsGlobal({ limit, type, direction, sort });
    res.json({ data: result });
  })
);

/**
 * Walk-forward backtest of each strategy on weekly prices, net of fees, plus
 * today's fair-entry candidates. First call builds the price panel (slow);
 * it is cached for six hours.
 */
router.get(
  '/strategy',
  asyncHandler(async (req, res) => {
    const market = req.query.market === 'psa10' ? 'psa10' : 'raw';
    const horizonWeeks = req.query.horizon ? parseInt(req.query.horizon as string, 10) : 8;
    const refresh = req.query.refresh === '1';
    const result = await getStrategyReport({
      market,
      horizonWeeks: Number.isFinite(horizonWeeks) ? horizonWeeks : 8,
      refresh,
    });
    res.json({ data: result });
  })
);

const ebayQuerySchema = z.object({
  game: z.enum(['pokemon', 'onepiece']).optional(),
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
  sort: z.enum(['best', 'discount_pct', 'savings', 'price', 'market', 'ending']).optional(),
  refresh: z.enum(['1', 'true', '0', 'false', 'full']).optional(),
});

/**
 * eBay listings for cards the fair-entry screen would buy and slabs scored
 * watch or better. The discount bar defaults to at-or-under market, which is
 * looser than the deals feed.
 */
router.get(
  '/ebay',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const parsed = ebayQuerySchema.safeParse(req.query);
    if (!parsed.success) return fail(res, 'Invalid investment listings query', 400);
    const query: DealQuery = {
      game: (parsed.data.game || 'pokemon') as DealGame,
      condition: parsed.data.type || 'all',
      listingType: parsed.data.listingType || 'all',
      minDiscount: parsed.data.minDiscount,
      minSavings: parsed.data.minSavings,
      minMarketValue: parsed.data.minMarketValue,
      gradingCompany: parsed.data.gradingCompany,
      grade: parsed.data.grade,
      set: parsed.data.set,
      rarity: parsed.data.rarity,
      minPrice: parsed.data.minPrice,
      maxPrice: parsed.data.maxPrice,
      freeShipping: parsed.data.freeShipping === '1' || parsed.data.freeShipping === 'true',
      language: parsed.data.language,
      sort: (parsed.data.sort || 'best') as DealSort,
      refresh:
        parsed.data.refresh === '1' ||
        parsed.data.refresh === 'true' ||
        parsed.data.refresh === 'full',
      fullRescan: parsed.data.refresh === 'full',
      scan: 'investment',
    };
    const result = await getInvestmentEbayListings(query, req.user?.id);
    return ok(res, result);
  })
);

/** Per-card investment check: break-even after fees, entry quality, base rates. */
router.get(
  '/card-check',
  asyncHandler(async (req, res) => {
    const cardId = (req.query.cardId as string) || '';
    if (!cardId) return res.status(400).json({ error: 'cardId is required' });
    const horizon = req.query.horizon ? parseInt(req.query.horizon as string, 10) : 8;
    const result = await getCardCheck({
      cardId,
      variant: (req.query.variant as string) || undefined,
      productId: req.query.productId ? Number(req.query.productId) || undefined : undefined,
      horizonWeeks: Number.isFinite(horizon) ? horizon : 8,
    });
    res.json({ data: result });
  })
);

export default router;
