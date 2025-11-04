import * as Sentry from '@sentry/node';
import { env } from './env';

export const initSentry = () => {
  if (env.sentry.dsn && env.isProduction) {
    Sentry.init({
      dsn: env.sentry.dsn,
      environment: env.sentry.environment,
      tracesSampleRate: 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
      ],
    });

    console.log('Sentry initialized for backend error tracking');
  }
};

export { Sentry };

