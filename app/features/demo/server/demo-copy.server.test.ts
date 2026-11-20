import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { demoRoleOf, touchDemoCopy } from '~/features/demo/server/demo-copy.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb } from '~/shared/infra/db.server'

vi.mock('~/shared/infra/db.server', () => ({ unscopedDb: { congregation: { updateMany: vi.fn() } } }))

const HOUR = 60 * 60 * 1000
const READY = new Date('2026-11-20T10:00:00Z')
const NOW = new Date(READY.getTime() + 2 * HOUR)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('UNITAE_DEMO', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('touchDemoCopy', () => {
  it('pushes a copy’s expiry an hour on, only if nobody pushed it since', async () => {
    const expiresAt = new Date(NOW.getTime() + 10 * 60 * 1000)
    await touchDemoCopy({ id: 31, demoExpiresAt: expiresAt, demoReadyAt: READY }, NOW)

    expect(unscopedDb.congregation.updateMany).toHaveBeenCalledWith({
      where: { id: 31, demoExpiresAt: expiresAt },
      data: { demoExpiresAt: new Date(NOW.getTime() + HOUR) },
    })
  })

  it('writes nothing for a real congregation, a copy not ready, or a push under a minute old', async () => {
    await touchDemoCopy({ id: 1, demoExpiresAt: null, demoReadyAt: null }, NOW)
    await touchDemoCopy({ id: 31, demoExpiresAt: new Date(NOW.getTime() + HOUR), demoReadyAt: null }, NOW)
    await touchDemoCopy({ id: 31, demoExpiresAt: new Date(NOW.getTime() + HOUR - 1000), demoReadyAt: READY }, NOW)

    expect(unscopedDb.congregation.updateMany).not.toHaveBeenCalled()
  })
})

describe('demoRoleOf', () => {
  it('names the role the signed-in login is the copy’s login for', async () => {
    const db = { setting: { findFirst: vi.fn().mockResolvedValue({ value: '{"secretary":412,"publisher":418}' }) } }
    await expect(demoRoleOf(db as unknown as TransactionClient, 31, 418)).resolves.toBe('publisher')
  })

  it('gives nothing for a login that isn’t a role’s', async () => {
    const db = { setting: { findFirst: vi.fn().mockResolvedValue({ value: '{"secretary":412}' }) } }
    await expect(demoRoleOf(db as unknown as TransactionClient, 31, 999)).resolves.toBeNull()
  })
})
