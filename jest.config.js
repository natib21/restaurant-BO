/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/setup.js'],
  verbose: true,
  transform: {},
  transformIgnorePatterns: [],
  detectOpenHandles: false,
  forceExit: true,
  runner: 'jest-runner',
};
