const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  jest.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  process.env = OLD_ENV;
  jest.restoreAllMocks();
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
