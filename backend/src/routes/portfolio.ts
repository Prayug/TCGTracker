import { Router, Response } from 'express';
import { z } from 'zod';
import { PortfolioService } from '../services/portfolioService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';

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
  }),
});

const updateItemSchema = z.object({
  body: z.object({
    quantity: z.number().int().positive().optional(),
    purchasePrice: z.number().optional(),
    condition: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const createPortfolioRouter = (portfolioService: PortfolioService) => {
  /**
   * @swagger
   * /api/portfolio:
   *   get:
   *     summary: Get user's collection
   *     tags: [Portfolio]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User's collection
   */
  router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const collection = await portfolioService.getCollection(req.user!.id);
      res.json({ collection });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /api/portfolio/stats:
   *   get:
   *     summary: Get portfolio statistics
   *     tags: [Portfolio]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Portfolio statistics
   */
  router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await portfolioService.getPortfolioStats(req.user!.id);
      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @swagger
   * /api/portfolio:
   *   post:
   *     summary: Add card to collection
   *     tags: [Portfolio]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - cardId
   *               - cardName
   *             properties:
   *               cardId:
   *                 type: string
   *               cardName:
   *                 type: string
   *               quantity:
   *                 type: integer
   *               purchasePrice:
   *                 type: number
   *               purchaseDate:
   *                 type: string
   *                 format: date
   *               condition:
   *                 type: string
   *               notes:
   *                 type: string
   *     responses:
   *       201:
   *         description: Card added to collection
   */
  router.post(
    '/',
    authenticate,
    validate(addToCollectionSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes } =
          req.body;
        const item = await portfolioService.addToCollection(
          req.user!.id,
          cardId,
          cardName,
          quantity,
          purchasePrice,
          purchaseDate,
          condition,
          notes
        );
        res.status(201).json({ item });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * @swagger
   * /api/portfolio/{id}:
   *   put:
   *     summary: Update collection item
   *     tags: [Portfolio]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               quantity:
   *                 type: integer
   *               purchasePrice:
   *                 type: number
   *               condition:
   *                 type: string
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Item updated successfully
   */
  router.put(
    '/:id',
    authenticate,
    validate(updateItemSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const itemId = parseInt(req.params.id, 10);
        await portfolioService.updateItem(itemId, req.user!.id, req.body);
        res.json({ message: 'Item updated successfully' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  /**
   * @swagger
   * /api/portfolio/{id}:
   *   delete:
   *     summary: Remove card from collection
   *     tags: [Portfolio]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Item removed successfully
   */
  router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.id, 10);
      await portfolioService.removeFromCollection(itemId, req.user!.id);
      res.json({ message: 'Item removed successfully' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

