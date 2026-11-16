module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '<rootDir>/test/**/*.spec.ts',
    '<rootDir>/test/**/*.e2e-spec.ts',
    '<rootDir>/src/**/*.spec.ts',
  ],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  clearMocks: true,
};
