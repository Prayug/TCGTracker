import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { env } from '../config/env';

function isCaptureSessionsPath(req: Request): boolean {
  const url = req.originalUrl || req.url || '';
  return url.includes('/api/capture-sessions');
}

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Phone QR capture polls every couple seconds from desktop + phone; don't
  // burn the global budget on that relay traffic.
  skip: isCaptureSessionsPath,
});

/** Generous limiter for phone↔desktop capture relay (poll + image upload). */
export const captureSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Too many capture-session requests, please wait a moment.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Very strict rate limiter for password change
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password change attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

