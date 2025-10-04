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

  const requestOrigin = origin || referer || '';
  const isAllowed = allowedOrigins.some(
    (allowed) => requestOrigin === allowed || requestOrigin.startsWith(allowed + '/') || requestOrigin.startsWith(allowed + ':')
  );

  if (!isAllowed) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }

  next();
};
