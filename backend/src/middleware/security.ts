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
  return cors({
    origin: env.cors.origin,
    credentials: true,
    optionsSuccessStatus: 200,
  });
};

