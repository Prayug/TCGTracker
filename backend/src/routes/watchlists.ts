import { Router, Response } from 'express';
import { z } from 'zod';
import { WatchlistService, WatchlistKind } from '../services/watchlistService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';

const listTypeSchema = z.enum(['watchlist', 'wishlist', 'tracked']);

const syncSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        cardId: z.string(),
        cardName: z.string(),
        game: z.string().optional(),
        listType: listTypeSchema,
        priority: z.string().optional(),
        targetPrice: z.number().optional(),
        notes: z.string().optional(),
        card: z.record(z.unknown()).optional(),
        addedAt: z.string().optional(),
        initialPrice: z.number().optional(),
      })
    ),
    wipeListTypes: z.array(listTypeSchema).optional(),
  }),
});

const upsertSchema = z.object({
  body: z.object({
    id: z.string(),
    cardId: z.string(),
    cardName: z.string(),
    game: z.string().optional(),
    listType: listTypeSchema,
    priority: z.string().optional(),
    targetPrice: z.number().optional(),
    notes: z.string().optional(),
    card: z.record(z.unknown()).optional(),
  }),
});

export const createWatchlistsRouter = (watchlistService: WatchlistService) => {
  const router = Router();

  router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const listType = req.query.listType as WatchlistKind | undefined;
      const items = await watchlistService.getForUser(req.user!.id, listType);
      ok(res, { items });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/sync', authenticate, validate(syncSchema), async (req: AuthRequest, res: Response) => {
    try {
      const wipeTypes = (req.body.wipeListTypes || []) as WatchlistKind[];
      const items = req.body.items || [];

      if (items.length === 0 && wipeTypes.length > 0) {
        await watchlistService.wipeListTypes(req.user!.id, wipeTypes);
        const remaining = await watchlistService.getForUser(req.user!.id);
        return ok(res, { items: remaining, synced: 0 });
      }

      const synced = await watchlistService.syncForUser(req.user!.id, items);
      ok(res, { items: synced, synced: synced.length });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/', authenticate, validate(upsertSchema), async (req: AuthRequest, res: Response) => {
    try {
      const item = await watchlistService.upsert(req.user!.id, req.body);
      ok(res, { item }, 201);
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.delete('/:cardId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const listType = (req.query.listType as WatchlistKind) || 'tracked';
      const game = (req.query.game as string) || 'pokemon';
      await watchlistService.remove(req.user!.id, req.params.cardId, listType, game);
      ok(res, { deleted: true });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  return router;
};
