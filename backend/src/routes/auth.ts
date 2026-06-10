import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import { validate } from '../middleware/validation';
import { passwordChangeLimiter } from '../middleware/rateLimiter';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(8).max(100),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

const updateUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).optional(),
    email: z.string().email().optional(),
  }),
});

const changePasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(8).max(100),
  }),
});

export const createAuthRouter = (authService: AuthService) => {
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
  router.post('/register', validate(registerSchema), async (req, res: Response) => {
    try {
      const { username, email, password } = req.body;
      const result = await authService.register(username, email, password);
      setAuthCookie(res, result.token);
      res.status(201).json({ user: result.user });
    } catch (error: any) {
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
  router.post('/login', validate(loginSchema), async (req, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      setAuthCookie(res, result.token);
      res.json({ user: result.user });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  });

  router.post('/logout', (_req, res: Response) => {
    clearAuthCookie(res);
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
  router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const user = await authService.getUserById(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        user: {
          ...user,
          isAdmin: user.username === env.admin.username,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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
  router.put('/update', authenticate, validate(updateUserSchema), async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body;
      const user = await authService.updateUser(req.user!.id, updates);
      res.json({ user });
    } catch (error: any) {
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
  router.post(
    '/change-password',
    passwordChangeLimiter,
    authenticate,
    validate(changePasswordSchema),
    async (req: AuthRequest, res: Response) => {
      try {
        const { oldPassword, newPassword } = req.body;
        await authService.changePassword(req.user!.id, oldPassword, newPassword);
        res.json({ message: 'Password changed successfully' });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  return router;
};

