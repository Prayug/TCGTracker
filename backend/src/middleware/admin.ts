import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { AuthRequest } from './auth';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.username === env.admin.username) {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
};
