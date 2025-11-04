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

export const env: EnvConfig = {
  appName: getEnvVar('VITE_APP_NAME', 'Pokemon TCG Tracker'),
  appVersion: getEnvVar('VITE_APP_VERSION', '1.0.0'),
  apiUrl: getEnvVar('VITE_API_URL', 'http://localhost:3001'),
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

