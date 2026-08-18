import type { Express } from 'express';
import { env } from './config/env';
import { logger } from './utils/logger';

type HttpServer = ReturnType<Express['listen']>;

let server: HttpServer | null = null;

export function startServer(app: Express): HttpServer {
  server = app.listen(env.port, () => {
    logger.info(`TCGTracker Backend server running on http://${env.host}:${env.port}`);
    logger.info(`Price data updates scheduled daily at 2:00 AM EST`);
    logger.info(`API documentation available at http://${env.host}:${env.port}/api-docs`);
    logger.info(`Environment: ${env.nodeEnv}`);
    void import('./services/ebayBrowseClient').then(({ probeEbayBrowseAuth, isEbayBrowseConfigured }) => {
      if (!isEbayBrowseConfigured()) return;
      void probeEbayBrowseAuth().then((probe) => {
        if (probe.ok) {
          logger.info('eBay Browse API authenticated', { sandbox: probe.sandbox });
        } else {
          logger.warn('eBay Browse API not usable yet', { sandbox: probe.sandbox, error: probe.error });
        }
      });
    });
  });
  return server;
}

export function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}
