import { Response } from 'express';
import { env } from '../config/env';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res: Response, message: string, status = 500) {
  const clientMessage = env.isProduction ? 'An internal error occurred' : message;
  return res.status(status).json({ success: false, error: clientMessage });
}
