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
  // Peer git worktrees live under .claude/worktrees and must not be swept into this run.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/.next'],
};

module.exports = createJestConfig(config);
