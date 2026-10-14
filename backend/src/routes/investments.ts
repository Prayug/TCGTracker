import { Router, Response } from 'express';
import { logger } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';
import {
  getSlabMovers,
  getSimilarSlabs,
  scanBuyoutCandidates,
  getOpportunities,
  getExternalFactorsGlobal,
  type MoverDirection,
} from '../services/investmentOpportunitiesService';
import { getCardCheck, getStrategyReport } from '../services/strategyBacktest/service';

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
