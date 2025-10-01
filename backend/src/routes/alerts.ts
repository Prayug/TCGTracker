import { Router, Response } from 'express';
import { z } from 'zod';
import { AlertService } from '../services/alertService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();

const createAlertSchema = z.object({
  body: z.object({
    cardId: z.string(),
    cardName: z.string(),
    targetPrice: z.number().positive(),
    condition: z.enum(['above', 'below']),
  }),
});

const toggleAlertSchema = z.object({
  body: z.object({
    isActive: z.boolean(),
  }),
});

export const createAlertsRouter = (alertService: AlertService) => {
  /**
   * @swagger
   * /api/alerts:
   *   get:
   *     summary: Get all alerts for current user
   *     tags: [Alerts]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of alerts
   *       401:
   *         description: Unauthorized
   */
  router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const alerts = await alertService.getAlertsByUser(req.user!.id);
      res.json({ alerts });
    } catch (error: any) {
      logger.error('Alerts route error', { error: error.message });
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  /**
   * @swagger
   * /api/alerts:
   *   post:
   *     summary: Create a price alert
   *     tags: [Alerts]
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
   *               - targetPrice
   *               - condition
   *             properties:
   *               cardId:
   *                 type: string
   *               cardName:
   *                 type: string
   *               targetPrice:
   *                 type: number
   *               condition:
   *                 type: string
   *                 enum: [above, below]
   *     responses:
   *       201:
   *         description: Alert created successfully
   *       401:
   *         description: Unauthorized
   */
  router.post('/', authenticate, validate(createAlertSchema), async (req: AuthRequest, res: Response) => {
    try {
      const { cardId, cardName, targetPrice, condition } = req.body;
      const alert = await alertService.createAlert(
        req.user!.id,
        cardId,
        cardName,
        targetPrice,
        condition
      );
      res.status(201).json({ alert });
    } catch (error: any) {
      logger.error('Alerts route error', { error: error.message });
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  /**
   * @swagger
   * /api/alerts/{id}:
   *   delete:
   *     summary: Delete a price alert
   *     tags: [Alerts]
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
   *         description: Alert deleted successfully
   *       401:
   *         description: Unauthorized
   */
  router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const alertId = parseInt(req.params.id, 10);
      await alertService.deleteAlert(alertId, req.user!.id);
      res.json({ message: 'Alert deleted successfully' });
    } catch (error: any) {
      logger.error('Alerts route error', { error: error.message });
      res.status(500).json({ error: 'An internal error occurred' });
    }
  });

  /**
   * @swagger
   * /api/alerts/{id}/toggle:
   *   put:
   *     summary: Toggle alert active status
   *     tags: [Alerts]
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
   *             required:
   *               - isActive
   *             properties:
   *               isActive:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Alert status updated
   *       401:
   *         description: Unauthorized
   */
  router.put(
    '/:id/toggle',
    authenticate,
    validate(toggleAlertSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const alertId = parseInt(req.params.id, 10);
        const { isActive } = req.body;
        await alertService.toggleAlert(alertId, req.user!.id, isActive);
        res.json({ message: 'Alert status updated successfully' });
      } catch (error: any) {
        logger.error('Alerts route error', { error: error.message });
      res.status(500).json({ error: 'An internal error occurred' });
      }
    }
  );

  return router;
};

