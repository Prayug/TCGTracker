import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { AuthRequest } from './auth';

/** True when this verified email is listed in ADMIN_EMAILS. */
export function isAdminEmail(email: string | null | undefined, emailVerified: unknown): boolean {
  if (!email || Number(emailVerified) !== 1) return false;
  return env.admin.emails.includes(email.trim().toLowerCase());
}

/**
 * Admin = a verified account whose current email is in ADMIN_EMAILS, read from the
 * database on every request. The username and the token's claims grant nothing, so
 * registering as "admin" or renaming to it does not give access.
 */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  getDb().get(
    'SELECT email, email_verified FROM users WHERE id = ?',
    [userId],
    (err, row: { email?: string; email_verified?: number } | undefined) => {
      if (err) {
        logger.error('Admin check failed', { error: err.message });
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      if (row && isAdminEmail(row.email, row.email_verified)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Admin access required' });
    }
  );
};
