import { Response } from 'express';
import { env } from '../config/env';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(
  res: Response,
  message: string,
  status = 500,
  extra?: Record<string, unknown>
) {
  const clientMessage = env.isProduction && status >= 500 ? 'An internal error occurred' : message;
  return res.status(status).json({
    success: false,
    error: clientMessage,
    ...(extra || {}),
  });
}
