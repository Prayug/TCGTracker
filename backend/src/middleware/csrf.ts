import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Private LAN hosts so phone QR capture can POST via http://192.168.x.x:5173 in local dev. */
function isPrivateLanOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (m) {
      const second = Number(m[1]);
      return second >= 16 && second <= 31;
    }
    return false;
  } catch {
    return false;
  }
}

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
    ) ||
    (!env.isProduction && isPrivateLanOrigin(value));

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
