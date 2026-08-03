import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { authLimiter, passwordChangeLimiter } from '../middleware/rateLimiter';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies';
import { logger } from '../utils/logger';

const router = Router();

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

const resendSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

const verifySchema = z.object({
  body: z.object({
    token: z.string().min(16).max(200),
  }),
});

export const createAuthRouter = (authService: AuthService) => {
  router.post('/register', authLimiter, validate(registerSchema), async (req, res: Response) => {
    try {
      const { username, email, password } = req.body;
      const result = await authService.register(username, email, password);

      // Never create a session on register — user must verify email first.
      clearAuthCookie(res);
      res.status(201).json({
        user: result.user,
        requiresVerification: true,
        emailSent: result.emailSent,
        ...(result.verifyUrl ? { verifyUrl: result.verifyUrl } : {}),
        message: result.emailSent
          ? 'Check your email for a verification link before signing in.'
          : 'Account created, but email could not be sent. Use the verification link shown, or configure SMTP.',
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post('/login', authLimiter, validate(loginSchema), async (req, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      setAuthCookie(res, result.token);
      res.json({ user: result.user });
    } catch (error: any) {
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        return res.status(403).json({
          error: 'Please verify your email before signing in.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }
      res.status(401).json({ error: error.message });
    }
  });

  router.post('/logout', (_req, res: Response) => {
    clearAuthCookie(res);
    res.json({ success: true });
  });

  /** Confirm email from the link in the verification message. */
  router.post('/verify-email', authLimiter, validate(verifySchema), async (req, res: Response) => {
    try {
      const { token } = req.body;
      const result = await authService.verifyEmailToken(token);
      setAuthCookie(res, result.authToken);
      res.json({
        user: result.user,
        message: 'Email verified. You are signed in.',
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  /** Also support GET so the email link can open directly in a browser. */
  router.get('/verify-email', authLimiter, async (req, res: Response) => {
    try {
      const token = String(req.query.token || '');
      if (!token) {
        return res.status(400).json({ error: 'Missing verification token' });
      }
      const result = await authService.verifyEmailToken(token);
      setAuthCookie(res, result.authToken);
      res.json({
        user: result.user,
        message: 'Email verified. You are signed in.',
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post(
    '/resend-verification',
    authLimiter,
    validate(resendSchema),
    async (req, res: Response) => {
      try {
        const { email } = req.body;
        const result = await authService.resendVerificationEmail(email);
        res.json({
          success: true,
          emailSent: result.emailSent,
          ...(result.verifyUrl ? { verifyUrl: result.verifyUrl } : {}),
          message: 'If that email is registered and unverified, a new link was sent.',
        });
      } catch (error: any) {
        logger.error('Resend verification failed', { error: error.message });
        res.status(500).json({ error: 'Failed to resend verification email' });
      }
    }
  );

  router.get('/me', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.json({ user: null });
      }

      const user = await authService.getUserById(req.user.id);
      if (!user) {
        return res.json({ user: null });
      }
      // Unverified sessions shouldn't linger
      if (!user.email_verified) {
        clearAuthCookie(res);
        return res.json({ user: null });
      }
      res.json({ user });
    } catch (error: any) {
      logger.error('Get me failed', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });

  router.put('/update', authenticate, validate(updateUserSchema), async (req: AuthRequest, res: Response) => {
    try {
      const updates = req.body;
      const user = await authService.updateUser(req.user!.id, updates);
      if (updates.email && !user.email_verified) {
        clearAuthCookie(res);
        return res.json({
          user,
          requiresVerification: true,
          message: 'Email updated. Please verify the new address before signing in again.',
        });
      }
      res.json({ user });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

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
