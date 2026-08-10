import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('Pokemon TCG Tracker'),
  VITE_APP_VERSION: z.string().default('1.0.0'),
  VITE_API_URL: z.string().default('http://localhost:3001'),
  VITE_BACKEND_URL: z.string().optional(),
  VITE_ENABLE_AUTH: z
    .string()
    .optional()
    .transform((v) => {
      // Default on when unset; allow explicit false via 'false' / '0'
      if (v == null || v === '') return true;
      return v === 'true' || v === '1';
    }),
  VITE_ENABLE_ANALYTICS: z
    .string()
    .optional()
    .transform((v) => {
      // Opt-in: default off when unset
      if (v == null || v === '') return false;
      return v === 'true' || v === '1';
    }),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_SENTRY_ENVIRONMENT: z.string().default('development'),
  VITE_GA_TRACKING_ID: z.string().optional(),
  VITE_CARD_SCANNER_API_URL: z.string().optional(),
  VITE_POKEMON_TCG_API_BASE_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten());
}

const envVars = parsed.success ? parsed.data : envSchema.parse({});

const getApiUrl = (): string => {
  const configured =
    envVars.VITE_API_URL ||
    envVars.VITE_BACKEND_URL ||
    'http://localhost:3001';

  const cleanUrl = configured.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.DEV) {
      return window.location.origin;
    }
    const isLocalhost = /localhost|127\.0\.0\.1/.test(cleanUrl);
    if (cleanUrl && !isLocalhost) {
      return cleanUrl;
    }
    return window.location.origin;
  }

  return cleanUrl;
};

export function buildApiUrl(path: string): string {
  const base = getApiUrl().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export const env = {
  appName: envVars.VITE_APP_NAME,
  appVersion: envVars.VITE_APP_VERSION,
  get apiUrl() {
    return getApiUrl();
  },
  enableAuth: envVars.VITE_ENABLE_AUTH as boolean,
  enableAnalytics: envVars.VITE_ENABLE_ANALYTICS as boolean,
  sentryDsn: envVars.VITE_SENTRY_DSN || '',
  sentryEnvironment: envVars.VITE_SENTRY_ENVIRONMENT || 'development',
  gaTrackingId: envVars.VITE_GA_TRACKING_ID || '',
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};
