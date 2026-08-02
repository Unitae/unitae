import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    pioneerGoal: { findFirst: vi.fn() },
  },
}))

const { resolvePioneerGoal } = await import('./pioneer-goals.queries')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('resolvePioneerGoal', () => {
  it('returns the congregation override when a PioneerGoal row exists', async () => {
    vi.mocked(db.pioneerGoal.findFirst).mockResolvedValue({ monthlyHours: 15 } as never)

    const result = await resolvePioneerGoal(db, 2026, PublisherType.PionnierAuxiliaires)

    expect(result).toBe(15)
  })

  it('falls back to the built-in default when no override exists', async () => {
    vi.mocked(db.pioneerGoal.findFirst).mockResolvedValue(null)

    const result = await resolvePioneerGoal(db, 2026, PublisherType.PionnierPermanant)

    expect(result).toBe(50)
  })

  it('scopes the lookup by serviceYear and type (findFirst, not findUnique)', async () => {
    vi.mocked(db.pioneerGoal.findFirst).mockResolvedValue(null)

    await resolvePioneerGoal(db, 2025, PublisherType.PionnierSpecial)

    expect(db.pioneerGoal.findFirst).toHaveBeenCalledWith({
      where: { serviceYear: 2025, type: PublisherType.PionnierSpecial },
    })
  })
})
