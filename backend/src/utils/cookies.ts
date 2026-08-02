import { Response } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE_NAME = 'tcg_token';

/** Parse JWT_EXPIRES_IN-style values (`7d`, `24h`, `3600s`, bare seconds) into seconds. */
export function parseExpiresInToSeconds(value: string, fallbackSeconds = 7 * 24 * 60 * 60): number {
  const trimmed = value.trim();
  const match = /^(\d+)([smhd])?$/i.exec(trimmed);
  if (!match) return fallbackSeconds;
  const amount = parseInt(match[1], 10);
  const unit = (match[2] || 's').toLowerCase();
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    default:
      return fallbackSeconds;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  const maxAgeSeconds = parseExpiresInToSeconds(env.jwt.expiresIn);
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.isProduction) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res: Response): void {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (env.isProduction) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function getAuthCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${AUTH_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(AUTH_COOKIE_NAME.length + 1));
    }
  }
  return undefined;
}
