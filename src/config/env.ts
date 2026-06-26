/**
 * Environment configuration
 * Centralized access to environment variables with validation
 */

interface EnvConfig {
  appName: string;
  appVersion: string;
  apiUrl: string;
  pokemonTcgApiKey: string;
  enableAuth: boolean;
  enableAnalytics: boolean;
  sentryDsn: string;
  sentryEnvironment: string;
  gaTrackingId: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

const getEnvVar = (key: string, defaultValue: string = ''): string => {
  return import.meta.env[key] || defaultValue;
};

const getBooleanEnvVar = (key: string, defaultValue: boolean = false): boolean => {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
};

const isLocalhostUrl = (url: string): boolean => /localhost|127\.0\.0\.1/.test(url);

/** VITE_API_URL is canonical; VITE_BACKEND_URL is supported for older Vercel configs. */
const resolveConfiguredApiUrl = (): string => {
  const configured =
    getEnvVar('VITE_API_URL') ||
    getEnvVar('VITE_BACKEND_URL') ||
    'http://localhost:3001';
  return configured.replace(/\/$/, '');
};

/** Resolves backend base URL — in dev uses Vite origin so /api/* hits the proxy. */
export function getApiUrl(): string {
  const configuredApiUrl = resolveConfiguredApiUrl();

  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.DEV) {
      return window.location.origin;
    }
    if (configuredApiUrl && !isLocalhostUrl(configuredApiUrl)) {
      return configuredApiUrl;
    }
    // Same-origin fallback when nginx/Vercel proxies /api to the backend.
    return window.location.origin;
  }
  return configuredApiUrl || 'http://localhost:3001';
}

/** Build an absolute API URL (safe for `new URL()` and `fetch`). */
export function buildApiUrl(path: string): string {
  const base = getApiUrl().replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export const env: EnvConfig = {
  appName: getEnvVar('VITE_APP_NAME', 'Pokemon TCG Tracker'),
  appVersion: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  get apiUrl() {
    return getApiUrl();
  },
  pokemonTcgApiKey: getEnvVar('VITE_POKEMON_TCG_API_KEY'),
  enableAuth: getBooleanEnvVar('VITE_ENABLE_AUTH', true),
  enableAnalytics: getBooleanEnvVar('VITE_ENABLE_ANALYTICS', false),
  sentryDsn: getEnvVar('VITE_SENTRY_DSN'),
  sentryEnvironment: getEnvVar('VITE_SENTRY_ENVIRONMENT', 'development'),
  gaTrackingId: getEnvVar('VITE_GA_TRACKING_ID'),
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
};

// Validate required environment variables in production
if (env.isProduction) {
  const requiredVars: (keyof EnvConfig)[] = ['apiUrl'];
  const missingVars = requiredVars.filter((key) => !env[key]);
  
  if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
  }
}

