import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';

const OLD_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD_ENV };
  vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  process.env = OLD_ENV;
  vi.restoreAllMocks();
});

describe('env validation', () => {
  it('parses valid environment variables successfully', async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.NODE_ENV = 'development';
    await expect(import('../env')).resolves.toBeDefined();
  });

  it('rejects missing JWT_SECRET (less than 32 chars)', async () => {
    process.env.JWT_SECRET = 'short';
    process.env.NODE_ENV = 'development';
    await expect(import('../env')).rejects.toThrow();
  });

  it('rejects invalid NODE_ENV', async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.NODE_ENV = 'invalid';
    await expect(import('../env')).rejects.toThrow();
  });
});
