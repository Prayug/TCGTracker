import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define environment schema with validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('localhost'),
  DATABASE_PATH: z.string().default('./tcg-prices.db'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().default('10'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./backend.log'),
  POKEMON_TCG_API_KEY: z.string().optional(),
  TCGCSV_API_KEY: z.string().optional(),
  APIFY_API_TOKEN: z.string().optional(),
  PKMNPRICES_API_KEY: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  APP_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  ADMIN_USERNAME: z.string().default('admin'),
  CLOUD_SYNC_ENABLED: z.string().default('false'),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().default('tcgtracker-data'),
});

// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

const jwtSecret = parsedEnv.data.JWT_SECRET;

export const env = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parseInt(parsedEnv.data.PORT, 10),
  host: parsedEnv.data.HOST,
  databasePath: parsedEnv.data.DATABASE_PATH,
  jwt: {
    secret: jwtSecret,
    expiresIn: parsedEnv.data.JWT_EXPIRES_IN,
  },
  bcrypt: {
    rounds: parseInt(parsedEnv.data.BCRYPT_ROUNDS, 10),
  },
  cors: {
    origin: parsedEnv.data.CORS_ORIGIN,
  },
  rateLimit: {
    windowMs: parseInt(parsedEnv.data.RATE_LIMIT_WINDOW_MS, 10),
    maxRequests: parseInt(parsedEnv.data.RATE_LIMIT_MAX_REQUESTS, 10),
  },
  log: {
    level: parsedEnv.data.LOG_LEVEL,
    file: parsedEnv.data.LOG_FILE,
  },
  apis: {
    pokemonTcg: parsedEnv.data.POKEMON_TCG_API_KEY,
    tcgcsv: parsedEnv.data.TCGCSV_API_KEY,
    apify: parsedEnv.data.APIFY_API_TOKEN,
    pkmnprices: parsedEnv.data.PKMNPRICES_API_KEY,
    youtube: parsedEnv.data.YOUTUBE_API_KEY,
    groq: parsedEnv.data.GROQ_API_KEY,
  },
  email: {
    host: parsedEnv.data.SMTP_HOST,
    port: parsedEnv.data.SMTP_PORT ? parseInt(parsedEnv.data.SMTP_PORT, 10) : undefined,
    user: parsedEnv.data.SMTP_USER,
    password: parsedEnv.data.SMTP_PASSWORD,
    from: parsedEnv.data.EMAIL_FROM || 'noreply@tcgtracker.com',
  },
  /** Public frontend origin for email links. */
  appUrl: (() => {
    if (parsedEnv.data.APP_URL) {
      return parsedEnv.data.APP_URL.replace(/\/$/, '');
    }
    const origins = (parsedEnv.data.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (parsedEnv.data.NODE_ENV === 'development') {
      const local = origins.find((o) => /localhost|127\.0\.0\.1/.test(o));
      if (local) return local.replace(/\/$/, '');
    }
    return (origins[0] || 'http://localhost:5173').replace(/\/$/, '');
  })(),
  sentry: {
    dsn: parsedEnv.data.SENTRY_DSN,
    environment: parsedEnv.data.SENTRY_ENVIRONMENT,
  },
  cloud: {
    enabled: parsedEnv.data.CLOUD_SYNC_ENABLED.toLowerCase() === 'true',
    supabaseUrl: parsedEnv.data.SUPABASE_URL,
    serviceRoleKey: parsedEnv.data.SUPABASE_SERVICE_ROLE_KEY,
    bucket: parsedEnv.data.SUPABASE_BUCKET,
  },
  admin: {
    username: parsedEnv.data.ADMIN_USERNAME,
  },
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
};

