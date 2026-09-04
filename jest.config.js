const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  // `@/*` resolves to both the repo root and ./src (mirrors tsconfig paths).
  moduleNameMapper: {
    '^@/(.*)$': ['<rootDir>/$1', '<rootDir>/src/$1'],
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
};

module.exports = createJestConfig(config);
