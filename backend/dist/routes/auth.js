"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const rateLimiter_1 = require("../middleware/rateLimiter");
const cookies_1 = require("../utils/cookies");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Validation schemas
const registerSchema = zod_1.z.object({
    body: zod_1.z.object({
        username: zod_1.z.string().min(3).max(50),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(8).max(100),
    }),
});
const loginSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email(),
        password: zod_1.z.string(),
    }),
});
const updateUserSchema = zod_1.z.object({
    body: zod_1.z.object({
        username: zod_1.z.string().min(3).max(50).optional(),
        email: zod_1.z.string().email().optional(),
    }),
});
const changePasswordSchema = zod_1.z.object({
    body: zod_1.z.object({
        oldPassword: zod_1.z.string(),
        newPassword: zod_1.z.string().min(8).max(100),
    }),
});
const createAuthRouter = (authService) => {
    /**
     * @swagger
     * /api/auth/register:
     *   post:
     *     summary: Register a new user
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - username
     *               - email
     *               - password
     *             properties:
     *               username:
     *                 type: string
     *               email:
     *                 type: string
     *               password:
     *                 type: string
     *     responses:
     *       201:
     *         description: User registered successfully
     *       400:
     *         description: Validation error or user already exists
     */
    router.post('/register', rateLimiter_1.authLimiter, (0, validation_1.validate)(registerSchema), async (req, res) => {
        try {
            const { username, email, password } = req.body;
            const result = await authService.register(username, email, password);
            (0, cookies_1.setAuthCookie)(res, result.token);
            res.status(201).json({ user: result.user });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    /**
     * @swagger
     * /api/auth/login:
     *   post:
     *     summary: Login user
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - email
     *               - password
     *             properties:
     *               email:
     *                 type: string
     *               password:
     *                 type: string
     *     responses:
     *       200:
     *         description: Login successful
     *       401:
     *         description: Invalid credentials
     */
    router.post('/login', rateLimiter_1.authLimiter, (0, validation_1.validate)(loginSchema), async (req, res) => {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);
            (0, cookies_1.setAuthCookie)(res, result.token);
            res.json({ user: result.user });
        }
        catch (error) {
            res.status(401).json({ error: error.message });
        }
    });
    router.post('/logout', (_req, res) => {
        (0, cookies_1.clearAuthCookie)(res);
        res.json({ success: true });
    });
    /**
     * @swagger
     * /api/auth/me:
     *   get:
     *     summary: Get current user
     *     tags: [Auth]
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: User data
     *       401:
     *         description: Unauthorized
     */
    router.get('/me', auth_1.optionalAuth, async (req, res) => {
        try {
            if (!req.user) {
                return res.json({ user: null });
            }
            const user = await authService.getUserById(req.user.id);
            if (!user) {
                return res.json({ user: null });
            }
            res.json({ user });
        }
        catch (error) {
            logger_1.logger.error('Get me failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch user data' });
        }
    });
    router.put('/update', auth_1.authenticate, (0, validation_1.validate)(updateUserSchema), async (req, res) => {
        try {
            const updates = req.body;
            const user = await authService.updateUser(req.user.id, updates);
            res.json({ user });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    /**
     * @swagger
     * /api/auth/change-password:
     *   post:
     *     summary: Change user password
     *     tags: [Auth]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - oldPassword
     *               - newPassword
     *             properties:
     *               oldPassword:
     *                 type: string
     *               newPassword:
     *                 type: string
     *     responses:
     *       200:
     *         description: Password changed successfully
     *       400:
     *         description: Invalid current password
     *       401:
     *         description: Unauthorized
     */
    router.post('/change-password', rateLimiter_1.passwordChangeLimiter, auth_1.authenticate, (0, validation_1.validate)(changePasswordSchema), async (req, res) => {
        try {
            const { oldPassword, newPassword } = req.body;
            await authService.changePassword(req.user.id, oldPassword, newPassword);
            res.json({ message: 'Password changed successfully' });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    return router;
};
exports.createAuthRouter = createAuthRouter;
