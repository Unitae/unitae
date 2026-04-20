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
    include: ['app/**/*.test.ts'],
    exclude: ['app/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/**/*.server.ts'],
      exclude: ['app/database/**', 'app/**/routes/**'],
    },
  },
})
