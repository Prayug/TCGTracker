import * as Sentry from '@sentry/react';
import { env } from './env';

export const initSentry = () => {
  if (env.sentryDsn && env.isProduction) {
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.isProduction ? env.sentryEnvironment || 'production' : env.sentryEnvironment,
      release: env.appVersion || undefined,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,

      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          if (event.request.data && typeof event.request.data === 'string') {
            try {
              const parsed = JSON.parse(event.request.data);
              if (parsed.password) parsed.password = '[REDACTED]';
              if (parsed.oldPassword) parsed.oldPassword = '[REDACTED]';
              if (parsed.newPassword) parsed.newPassword = '[REDACTED]';
              if (parsed.token) parsed.token = '[REDACTED]';
              event.request.data = JSON.stringify(parsed);
            } catch {
              event.request.data = '[REDACTED]';
            }
          }
        }
        return event;
      },
    });
  }
};

export { Sentry };
