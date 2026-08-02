import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env';

export const securityMiddleware = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
};

export const corsMiddleware = () => {
  const origins = env.cors.origin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowPrivateLan = !env.isProduction;

  return cors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (origins.includes('*') || origins.includes(requestOrigin)) {
        callback(null, true);
        return;
      }
      if (allowPrivateLan) {
        try {
          const host = new URL(requestOrigin).hostname;
          const isLan =
            host === 'localhost' ||
            host === '127.0.0.1' ||
            /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
            /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host);
          if (isLan) {
            callback(null, true);
            return;
          }
        } catch {
          // fall through
        }
      }
      callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
  });
};

