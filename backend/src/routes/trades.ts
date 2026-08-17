import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';
import {
  deleteTrade,
  getTradeByShareToken,
  listTradesForUser,
  toClientTrade,
  upsertTrade,
} from '../services/tradeService';

const router = Router();

const payloadSchema = z.object({
  v: z.literal(1),
  g: z.enum(['pokemon', 'onepiece']),
  t: z.string().max(120).optional(),
  a: z.array(z.unknown()).max(40),
  b: z.array(z.unknown()).max(40),
  ca: z.number().min(0).max(1_000_000),
  cb: z.number().min(0).max(1_000_000),
});

const upsertSchema = z.object({
  body: z.object({
    id: z.string().optional(),
    title: z.string().max(120).optional(),
    game: z.enum(['pokemon', 'onepiece']),
    payload: payloadSchema,
    giveTotal: z.number().min(0).max(10_000_000),
    getTotal: z.number().min(0).max(10_000_000),
  }),
});

router.get('/public/:token', async (req, res: Response) => {
  try {
    const token = String(req.params.token || '');
    if (!token || token.length < 6) return fail(res, 'Invalid share link', 400);
    const trade = await getTradeByShareToken(token);
    if (!trade) return fail(res, 'Trade not found', 404);
    return ok(res, { trade: toClientTrade(trade) });
  } catch (error: any) {
    return fail(res, error.message);
  }
});

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const trades = await listTradesForUser(req.user!.id);
    return ok(res, { trades: trades.map(toClientTrade) });
  } catch (error: any) {
    return fail(res, error.message);
  }
});

router.post('/', authenticate, validate(upsertSchema), async (req: AuthRequest, res: Response) => {
  try {
    const trade = await upsertTrade({
      userId: req.user!.id,
      id: req.body.id,
      title: req.body.title,
      game: req.body.game,
      payload: req.body.payload,
      giveTotal: req.body.giveTotal,
      getTotal: req.body.getTotal,
    });
    return ok(res, { trade: toClientTrade(trade) }, 201);
  } catch (error: any) {
    return fail(res, error.message);
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const removed = await deleteTrade(req.user!.id, req.params.id);
    if (!removed) return fail(res, 'Trade not found', 404);
    return ok(res, { deleted: true });
  } catch (error: any) {
    return fail(res, error.message);
  }
});

export default router;
