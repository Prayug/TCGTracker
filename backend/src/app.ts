import express from 'express';
import { corsMiddleware, securityMiddleware } from './middleware/security';
import { csrfProtection } from './middleware/csrf';
import { apiLimiter } from './middleware/rateLimiter';
import { requestLogger, logger } from './utils/logger';

const BODY_LIMIT = '20mb';
const REQUEST_TIMEOUT_MS = 120000;

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  app.use(securityMiddleware());
  app.use(corsMiddleware());
  app.use(csrfProtection);
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.use((req, res, next) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      logger.warn('Request timed out', { method: req.method, url: req.url });
      if (!res.headersSent) {
        res.status(503).json({ error: 'Request timed out' });
      }
    });
    next();
  });

  app.use(requestLogger);
  app.use('/api/', apiLimiter);

  return app;
}
