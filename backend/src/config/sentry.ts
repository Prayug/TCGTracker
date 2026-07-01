import * as Sentry from '@sentry/node';
import { env } from './env';
import { logger } from '../utils/logger';

export const initSentry = () => {
  if (env.sentry.dsn && env.isProduction) {
    Sentry.init({
      dsn: env.sentry.dsn,
      environment: env.sentry.environment,
      tracesSampleRate: 0.2,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
    });

    logger.info('Sentry initialized for backend error tracking');
  }
};

export { Sentry };

