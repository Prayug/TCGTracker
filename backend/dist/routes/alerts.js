"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAlertsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const createAlertSchema = zod_1.z.object({
    body: zod_1.z.object({
        cardId: zod_1.z.string(),
        cardName: zod_1.z.string(),
        targetPrice: zod_1.z.number().positive(),
        condition: zod_1.z.enum(['above', 'below']),
    }),
});
const toggleAlertSchema = zod_1.z.object({
    body: zod_1.z.object({
        isActive: zod_1.z.boolean(),
    }),
});
const createAlertsRouter = (alertService) => {
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
    router.get('/', auth_1.authenticate, async (req, res) => {
        try {
            const alerts = await alertService.getAlertsByUser(req.user.id);
            res.json({ alerts });
        }
        catch (error) {
            logger_1.logger.error('Alerts route error', { error: error.message });
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
    router.post('/', auth_1.authenticate, (0, validation_1.validate)(createAlertSchema), async (req, res) => {
        try {
            const { cardId, cardName, targetPrice, condition } = req.body;
            const alert = await alertService.createAlert(req.user.id, cardId, cardName, targetPrice, condition);
            res.status(201).json({ alert });
        }
        catch (error) {
            logger_1.logger.error('Alerts route error', { error: error.message });
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
    router.delete('/:id', auth_1.authenticate, async (req, res) => {
        try {
            const alertId = parseInt(req.params.id, 10);
            await alertService.deleteAlert(alertId, req.user.id);
            res.json({ message: 'Alert deleted successfully' });
        }
        catch (error) {
            logger_1.logger.error('Alerts route error', { error: error.message });
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
    router.put('/:id/toggle', auth_1.authenticate, (0, validation_1.validate)(toggleAlertSchema), async (req, res) => {
        try {
            const alertId = parseInt(req.params.id, 10);
            const { isActive } = req.body;
            await alertService.toggleAlert(alertId, req.user.id, isActive);
            res.json({ message: 'Alert status updated successfully' });
        }
        catch (error) {
            logger_1.logger.error('Alerts route error', { error: error.message });
            res.status(500).json({ error: 'An internal error occurred' });
        }
    });
    return router;
};
exports.createAlertsRouter = createAlertsRouter;
