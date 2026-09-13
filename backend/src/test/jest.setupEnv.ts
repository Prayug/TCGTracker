/**
 * Ensure required env vars exist before any module imports `src/config/env.ts`.
 * CI does not load a developer `.env`; Jest setup must be self-contained.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ci-test-jwt-secret-at-least-32-chars-long';
process.env.PORT = process.env.PORT || '3001';
process.env.HOST = process.env.HOST || 'localhost';
process.env.DATABASE_PATH = process.env.DATABASE_PATH || ':memory:';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
