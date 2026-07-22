import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { $queryRaw: vi.fn() },
}))

vi.mock('~/shared/infra/logger.server', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import logger from '~/shared/infra/logger.server'
import { assertRuntimeRoleEnforcesRls, evaluateRlsGuard } from './rls-guard.server'

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('evaluateRlsGuard', () => {
  it('is ok when the runtime URL is set and the role cannot bypass RLS', () => {
    expect(evaluateRlsGuard({ runtimeUrlSet: true, roleCanBypassRls: false, isProduction: true }).level).toBe('ok')
    expect(evaluateRlsGuard({ runtimeUrlSet: true, roleCanBypassRls: false, isProduction: false }).level).toBe('ok')
  })

  it('errors in production when the role can bypass RLS', () => {
    const verdict = evaluateRlsGuard({ runtimeUrlSet: true, roleCanBypassRls: true, isProduction: true })
    expect(verdict.level).toBe('error')
    expect(verdict.message).toBeTruthy()
  })

  it('warns (does not error) in development when the role can bypass RLS', () => {
    const verdict = evaluateRlsGuard({ runtimeUrlSet: true, roleCanBypassRls: true, isProduction: false })
    expect(verdict.level).toBe('warn')
    expect(verdict.message).toBeTruthy()
  })

  it('errors in production when the runtime URL is unset', () => {
    expect(evaluateRlsGuard({ runtimeUrlSet: false, roleCanBypassRls: false, isProduction: true }).level).toBe('error')
  })

  it('warns in development when the runtime URL is unset', () => {
    expect(evaluateRlsGuard({ runtimeUrlSet: false, roleCanBypassRls: false, isProduction: false }).level).toBe('warn')
  })
})

describe('assertRuntimeRoleEnforcesRls', () => {
  function clientReturning(canBypass: boolean) {
    return { $queryRaw: vi.fn().mockResolvedValue([{ can_bypass: canBypass }]) }
  }

  it('rejects in production when the connected role can bypass RLS', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DB_RUNTIME_URL', 'postgresql://unitae_app:pw@db/unitae')

    await expect(assertRuntimeRoleEnforcesRls(clientReturning(true))).rejects.toThrow()
  })

  it('resolves and warns in development when the connected role can bypass RLS', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('DB_RUNTIME_URL', 'postgresql://unitae_app:pw@db/unitae')

    await expect(assertRuntimeRoleEnforcesRls(clientReturning(true))).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('resolves silently in production when the role cannot bypass RLS', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DB_RUNTIME_URL', 'postgresql://unitae_app:pw@db/unitae')

    await expect(assertRuntimeRoleEnforcesRls(clientReturning(false))).resolves.toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('rejects in production when the probe unexpectedly returns no rows (fail closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DB_RUNTIME_URL', 'postgresql://unitae_app:pw@db/unitae')
    const client = { $queryRaw: vi.fn().mockResolvedValue([]) }

    await expect(assertRuntimeRoleEnforcesRls(client)).rejects.toThrow()
  })

  it('rejects in production when the probe query fails (fail closed)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DB_RUNTIME_URL', 'postgresql://unitae_app:pw@db/unitae')
    const client = { $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) }

    await expect(assertRuntimeRoleEnforcesRls(client)).rejects.toThrow()
  })

  it('rejects in production when DB_RUNTIME_URL is unset', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DB_RUNTIME_URL', '')

    await expect(assertRuntimeRoleEnforcesRls(clientReturning(false))).rejects.toThrow()
  })
})
