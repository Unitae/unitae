import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const ENV_KEYS = ['DB_URL', 'UNITAE_SESSION_SECRET', 'DB_RUNTIME_URL', 'UNITAE_CRON_SECRET'] as const

describe('env.server', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      delete process.env[key]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  })

  it('does not validate required env vars at import time', async () => {
    // Importing the module must have no side effect — a missing DB_URL must not
    // throw. Regression guard: a top-level validateEnv() call broke every unit
    // test that transitively imported this module in CI (no DB_URL set).
    await expect(import('./env.server')).resolves.toBeDefined()
  })

  it('getOptionalEnv works without any required env var set', async () => {
    const { getOptionalEnv } = await import('./env.server')
    expect(getOptionalEnv('UNITAE_OPEN_DATA_ALLOWLIST')).toBeUndefined()
    process.env.UNITAE_OPEN_DATA_ALLOWLIST = 'example.com'
    expect(getOptionalEnv('UNITAE_OPEN_DATA_ALLOWLIST')).toBe('example.com')
  })

  it('validateEnv throws when DB_URL is missing', async () => {
    const { validateEnv } = await import('./env.server')
    process.env.UNITAE_SESSION_SECRET = 'secret'
    expect(() => validateEnv()).toThrow('DB_URL')
  })

  it('validateEnv throws when UNITAE_SESSION_SECRET is missing', async () => {
    const { validateEnv } = await import('./env.server')
    process.env.DB_URL = 'postgresql://localhost/db'
    expect(() => validateEnv()).toThrow('UNITAE_SESSION_SECRET')
  })

  it('validateEnv passes when both required vars are set', async () => {
    const { validateEnv } = await import('./env.server')
    process.env.DB_URL = 'postgresql://localhost/db'
    process.env.UNITAE_SESSION_SECRET = 'secret'
    expect(() => validateEnv()).not.toThrow()
  })
})
