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
const resendSchema = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email(),
    }),
});
const verifySchema = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(16).max(200),
    }),
});
const createAuthRouter = (authService) => {
    router.post('/register', rateLimiter_1.authLimiter, (0, validation_1.validate)(registerSchema), async (req, res) => {
        try {
            const { username, email, password } = req.body;
            const result = await authService.register(username, email, password);
            // Never create a session on register — user must verify email first.
            (0, cookies_1.clearAuthCookie)(res);
            res.status(201).json({
                user: result.user,
                requiresVerification: true,
                emailSent: result.emailSent,
                ...(result.verifyUrl ? { verifyUrl: result.verifyUrl } : {}),
                message: result.emailSent
                    ? 'Check your email for a verification link before signing in.'
                    : 'Account created, but email could not be sent. Use the verification link shown, or configure SMTP.',
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.post('/login', rateLimiter_1.authLimiter, (0, validation_1.validate)(loginSchema), async (req, res) => {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);
            (0, cookies_1.setAuthCookie)(res, result.token);
            res.json({ user: result.user });
        }
        catch (error) {
            if (error.message === 'EMAIL_NOT_VERIFIED') {
                return res.status(403).json({
                    error: 'Please verify your email before signing in.',
                    code: 'EMAIL_NOT_VERIFIED',
                });
            }
            res.status(401).json({ error: error.message });
        }
    });
    router.post('/logout', (_req, res) => {
        (0, cookies_1.clearAuthCookie)(res);
        res.json({ success: true });
    });
    /** Confirm email from the link in the verification message. */
    router.post('/verify-email', rateLimiter_1.authLimiter, (0, validation_1.validate)(verifySchema), async (req, res) => {
        try {
            const { token } = req.body;
            const result = await authService.verifyEmailToken(token);
            (0, cookies_1.setAuthCookie)(res, result.authToken);
            res.json({
                user: result.user,
                message: 'Email verified. You are signed in.',
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    /** Also support GET so the email link can open directly in a browser. */
    router.get('/verify-email', rateLimiter_1.authLimiter, async (req, res) => {
        try {
            const token = String(req.query.token || '');
            if (!token) {
                return res.status(400).json({ error: 'Missing verification token' });
            }
            const result = await authService.verifyEmailToken(token);
            (0, cookies_1.setAuthCookie)(res, result.authToken);
            res.json({
                user: result.user,
                message: 'Email verified. You are signed in.',
            });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.post('/resend-verification', rateLimiter_1.authLimiter, (0, validation_1.validate)(resendSchema), async (req, res) => {
        try {
            const { email } = req.body;
            const result = await authService.resendVerificationEmail(email);
            res.json({
                success: true,
                emailSent: result.emailSent,
                ...(result.verifyUrl ? { verifyUrl: result.verifyUrl } : {}),
                message: 'If that email is registered and unverified, a new link was sent.',
            });
        }
        catch (error) {
            logger_1.logger.error('Resend verification failed', { error: error.message });
            res.status(500).json({ error: 'Failed to resend verification email' });
        }
    });
    router.get('/me', auth_1.optionalAuth, async (req, res) => {
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
                (0, cookies_1.clearAuthCookie)(res);
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
            if (updates.email && !user.email_verified) {
                (0, cookies_1.clearAuthCookie)(res);
                return res.json({
                    user,
                    requiresVerification: true,
                    message: 'Email updated. Please verify the new address before signing in again.',
                });
            }
            res.json({ user });
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
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
