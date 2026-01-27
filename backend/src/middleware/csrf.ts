import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (!origin && !referer) {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      next();
      return;
    }
    next();
    return;
  }

  const allowedOrigins = env.cors.origin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (allowedOrigins.includes('*')) {
    next();
    return;
  }

  const matchesAllowedOrigin = (value: string): boolean =>
    allowedOrigins.some(
      (allowed) =>
        value === allowed ||
        value.startsWith(`${allowed}/`) ||
        value.startsWith(`${allowed}:`)
    );

  // Vite dev proxy sets Origin to the backend target (changeOrigin: true) while Referer
  // still points at the frontend — check both headers independently.
  const isAllowed =
    (origin ? matchesAllowedOrigin(origin) : false) ||
    (referer ? matchesAllowedOrigin(referer) : false);

  if (!isAllowed) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }

  next();
};
