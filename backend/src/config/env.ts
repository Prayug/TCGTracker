import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

const DEFAULT_DEV_JWT_SECRET = 'dev-secret-change-me-please-1234567890';

// Define environment schema with validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  HOST: z.string().default('localhost'),
  DATABASE_PATH: z.string().default('./tcg-prices.db'),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().default('10'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./backend.log'),
  POKEMON_TCG_API_KEY: z.string().optional(),
  TCGCSV_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
});

// Parse and validate environment variables
const parsedEnv = envSchema.superRefine((data, ctx) => {
  if (!data.JWT_SECRET && data.NODE_ENV === 'production') {
    ctx.addIssue({
      path: ['JWT_SECRET'],
      code: z.ZodIssueCode.custom,
      message: 'JWT_SECRET must be provided in production.',
    });
  }
}).safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

const jwtSecret = parsedEnv.data.JWT_SECRET ?? DEFAULT_DEV_JWT_SECRET;

if (!parsedEnv.data.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET not provided. Using default development secret. Set JWT_SECRET in production.');
}

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
  },
  email: {
    host: parsedEnv.data.SMTP_HOST,
    port: parsedEnv.data.SMTP_PORT ? parseInt(parsedEnv.data.SMTP_PORT, 10) : undefined,
    user: parsedEnv.data.SMTP_USER,
    password: parsedEnv.data.SMTP_PASSWORD,
    from: parsedEnv.data.EMAIL_FROM || 'noreply@tcgtracker.com',
  },
  sentry: {
    dsn: parsedEnv.data.SENTRY_DSN,
    environment: parsedEnv.data.SENTRY_ENVIRONMENT,
  },
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isTest: parsedEnv.data.NODE_ENV === 'test',
};

