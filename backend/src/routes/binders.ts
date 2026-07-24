import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../db/database';
import { BinderService } from '../services/binderService';
import { generateBinderPlan } from '../services/binderPlannerService';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();

const slotInputSchema = z.object({
  pageNumber: z.number().int().positive().default(1),
  slotPosition: z.number().int().min(0).max(8),
  cardId: z.string(),
  cardSnapshot: z.string().optional(),
  marketPriceCents: z.number().int().optional(),
  notes: z.string().optional(),
});

const createBinderSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    game: z.enum(['pokemon', 'onepiece']).optional().default('pokemon'),
    pages: z.number().int().positive().optional().default(1),
    slotsPerPage: z.number().int().positive().optional().default(9),
    themeDescription: z.string().optional(),
    budgetCents: z.number().int().optional(),
    constraintsJson: z.string().optional(),
    slots: z.array(slotInputSchema).optional(),
  }),
});

const planSchema = z.object({
  body: z.object({
    prompt: z.string().min(1, 'Prompt is required'),
    budgetDollars: z.number().positive().optional(),
    pokemonTypes: z.array(z.string()).optional(),
    rarityPreferences: z.array(z.string()).optional(),
    eraBias: z.string().optional(),
    specificSets: z.array(z.string()).optional(),
    excludeSets: z.array(z.string()).optional(),
    themeKeywords: z.array(z.string()).optional(),
    compositionRules: z.array(z.string()).optional(),
    maxSingleCardPrice: z.number().optional(),
  }),
});

const updateSlotSchema = z.object({
  body: z.object({
    cardId: z.string().optional(),
    cardSnapshot: z.string().optional(),
    marketPriceCents: z.number().int().optional(),
    notes: z.string().optional(),
  }),
});

const asyncHandler = (fn: (req: AuthRequest, res: Response) => Promise<any>) =>
  (req: AuthRequest, res: Response) => {
    fn(req, res).catch((err: any) => {
      logger.error('Binder route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };

export const createBinderRouter = (binderService: BinderService) => {
  // Planning is public (matches vault/wishlist guest UX). Saving binders still requires auth.
  router.post('/plan', optionalAuth, validate(planSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const db = getDb();
    const plan = await generateBinderPlan(
      db,
      req.user?.id ?? 0,
      req.body.prompt,
      {
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
      }
    );
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

  router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binders = await binderService.listBinders(req.user!.id);
    const bindersWithSlots = await Promise.all(
      binders.map(b => binderService.getBinderWithSlots(b.id, req.user!.id))
    );
    res.json({ binders: bindersWithSlots.filter(Boolean) });
  }));

  router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    const binder = await binderService.getBinderWithSlots(binderId, req.user!.id);
    if (!binder) {
      return res.status(404).json({ error: 'Binder not found' });
    }
    res.json({ binder });
  }));

  router.post('/', authenticate, validate(createBinderSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const slots = req.body.slots?.map((s: { pageNumber: number; slotPosition: number; cardId: string; cardSnapshot?: string; marketPriceCents?: number; notes?: string }) => ({
      page_number: s.pageNumber,
      slot_position: s.slotPosition,
      card_id: s.cardId,
      card_snapshot: s.cardSnapshot,
      market_price_cents: s.marketPriceCents,
      notes: s.notes,
    }));
    const binder = await binderService.createBinder(req.user!.id, {
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

  router.put('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    await binderService.updateBinder(binderId, req.user!.id, req.body);
    const binder = await binderService.getBinder(binderId, req.user!.id);
    if (!binder) return res.status(404).json({ error: 'Binder not found' });
    res.json({ binder });
  }));

  router.delete('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    await binderService.deleteBinder(binderId, req.user!.id);
    res.json({ success: true });
  }));

  router.post('/:id/commit/vault', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    const count = await binderService.commitToVault(binderId, req.user!.id);
    res.json({ success: true, cardsAdded: count });
  }));

  router.post('/:id/commit/wishlist', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    const slots = await binderService.commitToWishlist(binderId, req.user!.id);
    const cards = slots.map(s => ({
      cardId: s.card_id,
      cardSnapshot: s.card_snapshot ? JSON.parse(s.card_snapshot) : null,
      marketPrice: s.market_price_cents ? s.market_price_cents / 100 : null,
    }));
    res.json({ success: true, cards });
  }));

  router.put('/:id/slots/:slotId', authenticate, validate(updateSlotSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    const slotId = parseInt(req.params.slotId, 10);

    const slot = await binderService.getSlot(slotId);
    if (!slot || slot.binder_id !== binderId) {
      return res.status(404).json({ error: 'Slot not found in this binder' });
    }

    await binderService.updateSlot(slotId, binderId, req.user!.id, {
      card_id: req.body.cardId,
      card_snapshot: req.body.cardSnapshot,
      market_price_cents: req.body.marketPriceCents,
      notes: req.body.notes,
    });

    const binder = await binderService.getBinderWithSlots(binderId, req.user!.id);
    res.json({ binder });
  }));

  router.post('/:id/refresh', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
    const binderId = parseInt(req.params.id, 10);
    const binder = await binderService.getBinder(binderId, req.user!.id);
    if (!binder) return res.status(404).json({ error: 'Binder not found' });

    const db = getDb();
    const plan = await generateBinderPlan(
      db,
      req.user!.id,
      binder.theme_description || '',
      binder.constraints_json ? JSON.parse(binder.constraints_json) : {}
    );

    await binderService.updateBinder(binderId, req.user!.id, {
      total_cost_cents: plan.totalCost,
    } as any);

    for (let i = 0; i < plan.slots.length; i++) {
      const slot = plan.slots[i];
      const existingSlot = (await binderService.getBinderWithSlots(binderId, req.user!.id))?.slots[i];
      if (existingSlot) {
        await binderService.updateSlot(existingSlot.id, binderId, req.user!.id, {
          card_id: slot.cardId,
          card_snapshot: JSON.stringify(slot),
          market_price_cents: slot.marketPrice ? Math.round(slot.marketPrice * 100) : null,
        });
      }
    }

    const updated = await binderService.getBinderWithSlots(binderId, req.user!.id);
    res.json({ binder: updated, plan });
  }));

  return router;
};

export default router;
