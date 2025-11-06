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
exports.createAuthRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
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
    router.post('/register', (0, validation_1.validate)(registerSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { username, email, password } = req.body;
            const result = yield authService.register(username, email, password);
            res.status(201).json(result);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    }));
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
    router.post('/login', (0, validation_1.validate)(loginSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { email, password } = req.body;
            const result = yield authService.login(email, password);
            res.json(result);
        }
        catch (error) {
            res.status(401).json({ error: error.message });
        }
    }));
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
    router.get('/me', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const user = yield authService.getUserById(req.user.id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json({ user });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }));
    /**
     * @swagger
     * /api/auth/update:
     *   put:
     *     summary: Update user profile
     *     tags: [Auth]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               username:
     *                 type: string
     *               email:
     *                 type: string
     *     responses:
     *       200:
     *         description: User updated successfully
     *       401:
     *         description: Unauthorized
     */
    router.put('/update', auth_1.authenticate, (0, validation_1.validate)(updateUserSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const updates = req.body;
            const user = yield authService.updateUser(req.user.id, updates);
            res.json({ user });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    }));
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
    router.post('/change-password', auth_1.authenticate, (0, validation_1.validate)(changePasswordSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { oldPassword, newPassword } = req.body;
            yield authService.changePassword(req.user.id, oldPassword, newPassword);
            res.json({ message: 'Password changed successfully' });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    }));
    return router;
};
exports.createAuthRouter = createAuthRouter;
