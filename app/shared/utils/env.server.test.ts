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
    vi.unstubAllEnvs()
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
    process.env.UNITAE_SESSION_SECRET = 'a-sufficiently-long-test-session-secret-value'
    expect(() => validateEnv()).not.toThrow()
  })

  describe('session secret enforcement', () => {
    const STRONG_SECRET = 'a-sufficiently-long-test-session-secret-value'
    const PLACEHOLDER = 'change-me-with-a-real-secret-key'

    beforeEach(() => {
      process.env.DB_URL = 'postgresql://localhost/db'
    })

    it('throws in production when the secret is shorter than 32 characters', async () => {
      const { validateEnv } = await import('./env.server')
      vi.stubEnv('NODE_ENV', 'production')
      process.env.UNITAE_SESSION_SECRET = 'too-short'
      expect(() => validateEnv()).toThrow('UNITAE_SESSION_SECRET')
    })

    it('throws in production on the example placeholder value', async () => {
      const { validateEnv } = await import('./env.server')
      vi.stubEnv('NODE_ENV', 'production')
      // The placeholder is exactly 32 chars, so length alone would not catch it.
      expect(PLACEHOLDER.length).toBe(32)
      process.env.UNITAE_SESSION_SECRET = PLACEHOLDER
      expect(() => validateEnv()).toThrow('UNITAE_SESSION_SECRET')
    })

    it('throws in production when a previous (rotated) secret is weak', async () => {
      const { validateEnv } = await import('./env.server')
      vi.stubEnv('NODE_ENV', 'production')
      process.env.UNITAE_SESSION_SECRET = `${STRONG_SECRET},short`
      expect(() => validateEnv()).toThrow('UNITAE_SESSION_SECRET')
    })

    it('does not throw in production with a strong, non-placeholder secret', async () => {
      const { validateEnv } = await import('./env.server')
      vi.stubEnv('NODE_ENV', 'production')
      process.env.UNITAE_SESSION_SECRET = STRONG_SECRET
      expect(() => validateEnv()).not.toThrow()
    })

    it('does not throw in development on a weak secret (warns instead)', async () => {
      const { validateEnv } = await import('./env.server')
      vi.stubEnv('NODE_ENV', 'development')
      process.env.UNITAE_SESSION_SECRET = 'too-short'
      expect(() => validateEnv()).not.toThrow()
    })
  })

  describe('getSessionSecrets', () => {
    it('returns [current, ...previous] from a comma-separated value', async () => {
      const { getSessionSecrets } = await import('./env.server')
      process.env.UNITAE_SESSION_SECRET = 'current-secret,previous-1,previous-2'
      expect(getSessionSecrets()).toEqual(['current-secret', 'previous-1', 'previous-2'])
    })

    it('trims whitespace and filters empty segments', async () => {
      const { getSessionSecrets } = await import('./env.server')
      process.env.UNITAE_SESSION_SECRET = ' a , , b '
      expect(getSessionSecrets()).toEqual(['a', 'b'])
    })

    it('returns a single-element array when there is no comma', async () => {
      const { getSessionSecrets } = await import('./env.server')
      process.env.UNITAE_SESSION_SECRET = 'only-one'
      expect(getSessionSecrets()).toEqual(['only-one'])
    })

    it('returns an empty array when the var is unset', async () => {
      const { getSessionSecrets } = await import('./env.server')
      expect(getSessionSecrets()).toEqual([])
    })
  })
})
