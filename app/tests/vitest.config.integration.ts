import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(import.meta.dirname, '..'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['app/**/*.integration.test.ts'],
    // Refuses to run against anything but a disposable test database — these suites truncate.
    // See app/tests/assert-test-database.ts.
    setupFiles: [resolve(import.meta.dirname, 'integration-setup.ts')],
    testTimeout: 30_000,
    // Integration files share one database, and migration tests execute real migration SQL, which
    // is global by nature — an INSERT referencing Member takes FOR KEY SHARE on the rows it points
    // at, including members another suite created, held until the fixture rolls back. The other
    // suite's cleanup then blocks and fails somewhere unrelated, so the symptom never names the
    // cause. Running files serially costs ~30s and removes the whole class.
    fileParallelism: false,
  },
})
