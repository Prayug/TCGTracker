module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // Runs before the test framework is installed — required so `env.ts` can load
  // without process.exit(1) when JWT_SECRET is unset (as on CI).
  setupFiles: ['<rootDir>/src/test/jest.setupEnv.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@tcgtracker/shared$': '<rootDir>/../packages/shared/src/index.ts',
  },
  verbose: true,
};

