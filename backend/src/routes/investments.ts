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

export default router;
