import * as Sentry from '@sentry/react';
import { env } from './env';

export const initSentry = () => {
  if (env.sentryDsn && env.isProduction) {
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.sentryEnvironment,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of transactions in production
      // Session Replay
      replaysSessionSampleRate: 0.1, // Sample 10% of sessions
      replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
      
      beforeSend(event, hint) {
        // Filter out sensitive information
        if (event.request) {
          delete event.request.cookies;
        }
        return event;
      },
    });

    console.log('Sentry initialized for error tracking');
  }
};

export { Sentry };

