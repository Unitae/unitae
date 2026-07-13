import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(import.meta.dirname, './app'),
      emails: resolve(import.meta.dirname, './app/emails'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['app/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['app/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'app/**/*.server.ts',
        'app/**/*.aggregate.ts',
        'app/**/*.workflow.ts',
        'app/**/*.queries.ts',
        'app/**/*.policy.ts',
      ],
      // Barrels, route glue, worker dispatch, and DB generated code are exempt
      // by the same rationale as check-service-test-coverage.ts's EXEMPT_FILES.
      exclude: [
        'app/database/**',
        'app/**/routes/**',
        'app/**/index.server.ts',
        'app/features/**/jobs/**',
        'app/workers/**',
      ],
      // Thresholds set below the current baseline to prevent regression
      // without blocking Wave 7's own backfill work. Ratchet upward as
      // future waves add tests.
      thresholds: {
        lines: 55,
        functions: 60,
        branches: 55,
        statements: 55,
      },
    },
  },
})
