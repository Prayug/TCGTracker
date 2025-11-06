"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortfolioRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
const addToCollectionSchema = zod_1.z.object({
    body: zod_1.z.object({
        cardId: zod_1.z.string(),
        cardName: zod_1.z.string(),
        quantity: zod_1.z.number().int().positive().default(1),
        purchasePrice: zod_1.z.number().optional(),
        purchaseDate: zod_1.z.string().optional(),
        condition: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
const updateItemSchema = zod_1.z.object({
    body: zod_1.z.object({
        quantity: zod_1.z.number().int().positive().optional(),
        purchasePrice: zod_1.z.number().optional(),
        condition: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    }),
});
const createPortfolioRouter = (portfolioService) => {
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
    router.get('/', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const collection = yield portfolioService.getCollection(req.user.id);
            res.json({ collection });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
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
    router.get('/stats', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const stats = yield portfolioService.getPortfolioStats(req.user.id);
            res.json({ stats });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
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
    router.post('/', auth_1.authenticate, (0, validation_1.validate)(addToCollectionSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes } = req.body;
            const item = yield portfolioService.addToCollection(req.user.id, cardId, cardName, quantity, purchasePrice, purchaseDate, condition, notes);
            res.status(201).json({ item });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
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
    router.put('/:id', auth_1.authenticate, (0, validation_1.validate)(updateItemSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const itemId = parseInt(req.params.id, 10);
            yield portfolioService.updateItem(itemId, req.user.id, req.body);
            res.json({ message: 'Item updated successfully' });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
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
    router.delete('/:id', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const itemId = parseInt(req.params.id, 10);
            yield portfolioService.removeFromCollection(itemId, req.user.id);
            res.json({ message: 'Item removed successfully' });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
    return router;
};
exports.createPortfolioRouter = createPortfolioRouter;
