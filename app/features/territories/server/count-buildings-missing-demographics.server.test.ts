import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { count: vi.fn() },
  },
}))

const { countBuildingsMissingDemographics } = await import('./count-buildings-missing-demographics.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.count).mockResolvedValue(0)
})

describe('countBuildingsMissingDemographics', () => {
  it('returns the count reported by Prisma', async () => {
    vi.mocked(db.building.count).mockResolvedValue(24)

    const result = await countBuildingsMissingDemographics(db, 1)

    expect(result).toBe(24)
  })

  it('scopes to buildings inside the territory belonging to the congregation', async () => {
    await countBuildingsMissingDemographics(db, 42)

    const where = vi.mocked(db.building.count).mock.calls[0][0]?.where
    expect(where).toMatchObject({ congregationId: 42, inTerritory: true })
  })

  it('requires at least one residential entrance on the building', async () => {
    await countBuildingsMissingDemographics(db, 1)

    const where = vi.mocked(db.building.count).mock.calls[0][0]?.where
    expect(where?.entrances).toEqual({ some: { kind: 'Residential' } })
  })

  it('matches buildings whose residentialData is null, or whose homes/phones fields are null', async () => {
    await countBuildingsMissingDemographics(db, 1)

    const where = vi.mocked(db.building.count).mock.calls[0][0]?.where
    expect(where?.OR).toEqual([
      { residentialData: null },
      { residentialData: { homes: null } },
      { residentialData: { phones: null } },
    ])
  })
})
