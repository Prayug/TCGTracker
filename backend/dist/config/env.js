"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
// Load environment variables
dotenv_1.default.config();
// Define environment schema with validation
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.string().default('3001'),
    HOST: zod_1.z.string().default('localhost'),
    DATABASE_PATH: zod_1.z.string().default('./tcg-prices.db'),
    JWT_SECRET: zod_1.z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    BCRYPT_ROUNDS: zod_1.z.string().default('10'),
    CORS_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    RATE_LIMIT_WINDOW_MS: zod_1.z.string().default('900000'),
    RATE_LIMIT_MAX_REQUESTS: zod_1.z.string().default('100'),
    LOG_LEVEL: zod_1.z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    LOG_FILE: zod_1.z.string().default('./backend.log'),
    POKEMON_TCG_API_KEY: zod_1.z.string().optional(),
    TCGCSV_API_KEY: zod_1.z.string().optional(),
    APIFY_API_TOKEN: zod_1.z.string().optional(),
    PKMNPRICES_API_KEY: zod_1.z.string().optional(),
    YOUTUBE_API_KEY: zod_1.z.string().optional(),
    SMTP_HOST: zod_1.z.string().optional(),
    SMTP_PORT: zod_1.z.string().optional(),
    SMTP_USER: zod_1.z.string().optional(),
    SMTP_PASSWORD: zod_1.z.string().optional(),
    EMAIL_FROM: zod_1.z.string().optional(),
    SENTRY_DSN: zod_1.z.string().optional(),
    SENTRY_ENVIRONMENT: zod_1.z.string().default('development'),
    ADMIN_USERNAME: zod_1.z.string().default('admin'),
    CLOUD_SYNC_ENABLED: zod_1.z.string().default('false'),
    SUPABASE_URL: zod_1.z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().optional(),
    SUPABASE_BUCKET: zod_1.z.string().default('tcgtracker-data'),
});
// Parse and validate environment variables
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsedEnv.error.format());
    process.exit(1);
}
const jwtSecret = parsedEnv.data.JWT_SECRET;
exports.env = {
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
