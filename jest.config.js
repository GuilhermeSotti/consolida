/**
 * Jest projects:
 *  - unit:        pure domain/application tests and isolated adapters (no database, no network)
 *  - contract:    contracts/openapi.yaml ↔ implemented routes, status codes and permissions
 *  - e2e:         real HTTP application (guards, filters, multer, streaming) with in-memory
 *                 persistence and locally signed access tokens (no database, no network)
 *  - integration: Prisma repositories and the job queue against a real PostgreSQL
 *                 (DATABASE_URL pointing to a disposable test database; see docs/guias/testes.md)
 */
const base = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  rootDir: __dirname,
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'contract',
      testMatch: ['<rootDir>/test/contract/**/*.contract-spec.ts'],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
    },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/worker.ts',
    '!src/database/seed.ts',
    '!src/database/grant-role.ts',
  ],
  coverageDirectory: 'coverage',
};
