import { Router, Response } from 'express';
import { z } from 'zod';
import { PortfolioService } from '../services/portfolioService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { ok, fail } from '../utils/apiResponse';

const router = Router();

const addToCollectionSchema = z.object({
  body: z.object({
    cardId: z.string(),
    cardName: z.string(),
    quantity: z.number().int().positive().default(1),
    purchasePrice: z.number().optional(),
    purchaseDate: z.string().optional(),
    condition: z.string().optional(),
    notes: z.string().optional(),
    cardData: z.string().optional(),
    clientVaultId: z.string().optional(),
  }),
});

const updateItemSchema = z.object({
  body: z.object({
    quantity: z.number().int().positive().optional(),
    purchasePrice: z.number().optional(),
    condition: z.string().optional(),
    notes: z.string().optional(),
    cardData: z.string().optional(),
  }),
});

const syncVaultSchema = z.object({
  body: z.object({
    cards: z.array(
      z.object({
        id: z.string(),
        card: z.record(z.unknown()),
        purchasePrice: z.coerce.number(),
        purchaseDate: z.string(),
        quantity: z.coerce.number().int().positive(),
        condition: z.string(),
        notes: z.string().nullish(),
        gradingResult: z.unknown().optional(),
        game: z.string().optional(),
      })
    ),
  }),
});

export const createPortfolioRouter = (portfolioService: PortfolioService) => {
  router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const collection = await portfolioService.getCollection(req.user!.id);
      ok(res, { collection });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await portfolioService.getPortfolioStats(req.user!.id);
      ok(res, { stats });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.get('/lots', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const openOnly = req.query.openOnly === 'true';
      const lots = await portfolioService.getLots(req.user!.id, openOnly);
      ok(res, { lots });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/lots/:id/close', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const lotId = parseInt(req.params.id, 10);
      const salePrice = Number(req.body?.salePrice);
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        return fail(res, 'salePrice is required', 400);
      }
      const lot = await portfolioService.closeLot(
        req.user!.id,
        lotId,
        salePrice,
        req.body?.soldAt
      );
      if (!lot) return fail(res, 'Lot not found', 404);
      ok(res, { lot });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/sync', authenticate, validate(syncVaultSchema), async (req: AuthRequest, res: Response) => {
    try {
      const collection = await portfolioService.syncVault(req.user!.id, req.body.cards);
      ok(res, { collection, synced: collection.length });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.post('/', authenticate, validate(addToCollectionSchema), async (req: AuthRequest, res: Response) => {
    try {
      const { cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes, cardData, clientVaultId } =
        req.body;
      const item = await portfolioService.addToCollection(
        req.user!.id,
        cardId,
        cardName,
        quantity,
        purchasePrice,
        purchaseDate,
        condition,
        notes,
        cardData,
        clientVaultId
      );
      ok(res, { item }, 201);
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.put('/:id', authenticate, validate(updateItemSchema), async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.id, 10);
      await portfolioService.updateItem(itemId, req.user!.id, req.body);
      ok(res, { updated: true });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.id, 10);
      await portfolioService.removeFromCollection(itemId, req.user!.id);
      ok(res, { deleted: true });
    } catch (error: any) {
      fail(res, error.message);
    }
  });

  return router;
};
