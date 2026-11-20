import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedDemoCongregation } from '~/database/demo/seed-demo'
import { seedPendingDemoCopies } from '~/features/demo/server/seed-demo-copies.server'
import { unscopedDb } from '~/shared/infra/db.server'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { congregation: { findMany: vi.fn(), update: vi.fn() } },
}))
vi.mock('~/database/demo/seed-demo', () => ({ seedDemoCongregation: vi.fn() }))

const db = vi.mocked(unscopedDb, true)
const NOW = new Date('2026-11-20T10:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('UNITAE_DEMO', 'true')
})
afterEach(() => vi.unstubAllEnvs())

describe('seedPendingDemoCopies', () => {
  it('fills each copy not yet ready, then marks it ready', async () => {
    db.congregation.findMany.mockResolvedValue([{ id: 31, name: 'Démo', slug: 'demo-x7k2p' }] as never)

    await expect(seedPendingDemoCopies(NOW)).resolves.toEqual({ seeded: 1, failed: 0 })

    // Never a copy already past its expiry: the control plane is deleting it.
    expect(db.congregation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { demoExpiresAt: { gt: NOW }, demoReadyAt: null } }),
    )
    expect(seedDemoCongregation).toHaveBeenCalledWith(
      unscopedDb,
      { id: 31, name: 'Démo', slug: 'demo-x7k2p' },
      { now: NOW, emailSuffix: 'demo-x7k2p', demoLogins: true, sharedBoardFiles: true },
    )
    expect(db.congregation.update).toHaveBeenCalledWith({ where: { id: 31 }, data: { demoReadyAt: NOW } })
  })

  it('does nothing when demo mode is off', async () => {
    vi.stubEnv('UNITAE_DEMO', '')

    await expect(seedPendingDemoCopies(NOW)).resolves.toEqual({ seeded: 0, failed: 0 })
    expect(db.congregation.findMany).not.toHaveBeenCalled()
  })

  it('expires a copy whose seed failed, so the control plane replaces it, and goes on with the next', async () => {
    db.congregation.findMany.mockResolvedValue([
      { id: 31, name: 'Démo', slug: 'demo-aaaaa' },
      { id: 32, name: 'Démo', slug: 'demo-bbbbb' },
    ] as never)
    vi.mocked(seedDemoCongregation).mockRejectedValueOnce(new Error('boom'))

    await expect(seedPendingDemoCopies(NOW)).resolves.toEqual({ seeded: 1, failed: 1 })
    // A half-filled copy can't be seeded again: it goes, and a fresh one takes its place.
    expect(db.congregation.update).toHaveBeenCalledWith({ where: { id: 31 }, data: { demoExpiresAt: NOW } })
    expect(db.congregation.update).toHaveBeenCalledWith({ where: { id: 32 }, data: { demoReadyAt: NOW } })
  })
})
