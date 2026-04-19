import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(import.meta.dirname, './app'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['app/**/*.integration.test.ts'],
    testTimeout: 30_000,
  },
})
