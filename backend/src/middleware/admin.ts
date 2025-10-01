import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest, authenticate } from './auth';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.username === env.admin.username) {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
};

/** Authenticate + check admin in all environments (never bypass auth). */
export const requireAdminUnlessDev = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (env.isDevelopment) {
    next();
    return;
  }
  authenticate(req, res, () => requireAdmin(req, res, next));
};
