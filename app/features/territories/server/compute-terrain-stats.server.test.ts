import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    buildingEntrance: { aggregate: vi.fn(), count: vi.fn() },
    building: { count: vi.fn() },
  },
}))

const { computeTerrainStats } = await import('./compute-terrain-stats.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 0, phones: 0 } } as never)
  vi.mocked(db.buildingEntrance.count).mockResolvedValue(0)
  vi.mocked(db.building.count).mockResolvedValue(0)
})

describe('computeTerrainStats', () => {
  it('returns zeros with null derived fields when the terrain is empty', async () => {
    const result = await computeTerrainStats(db, 1)

    expect(result).toEqual({
      homesCount: 0,
      phonesCount: 0,
      buildingsCount: 0,
      entrancesCount: 0,
      homesPerBuilding: null,
      phonesCoverage: null,
    })
  })

  it('sums homes and phones from residential entrance aggregates', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 3421, phones: 892 } } as never)
    vi.mocked(db.buildingEntrance.count).mockResolvedValue(312)
    vi.mocked(db.building.count).mockResolvedValue(245)

    const result = await computeTerrainStats(db, 1)

    expect(result.homesCount).toBe(3421)
    expect(result.phonesCount).toBe(892)
    expect(result.buildingsCount).toBe(245)
    expect(result.entrancesCount).toBe(312)
  })

  it('derives homes-per-building rounded to nearest integer', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 3421, phones: 0 } } as never)
    vi.mocked(db.building.count).mockResolvedValue(245)

    const result = await computeTerrainStats(db, 1)

    // 3421 / 245 = 13.963... → 14
    expect(result.homesPerBuilding).toBe(14)
  })

  it('derives phones coverage as percentage of homes rounded to nearest integer', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 3421, phones: 892 } } as never)

    const result = await computeTerrainStats(db, 1)

    // 892 / 3421 = 0.2607... → 26%
    expect(result.phonesCoverage).toBe(26)
  })

  it('returns null homes-per-building when there are no buildings', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 100, phones: 20 } } as never)
    vi.mocked(db.building.count).mockResolvedValue(0)

    const result = await computeTerrainStats(db, 1)

    expect(result.homesPerBuilding).toBeNull()
  })

  it('returns null phones coverage when there are no homes', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: 0, phones: 42 } } as never)

    const result = await computeTerrainStats(db, 1)

    expect(result.phonesCoverage).toBeNull()
  })

  it('treats null aggregate sums as zero', async () => {
    vi.mocked(db.buildingEntrance.aggregate).mockResolvedValue({ _sum: { homes: null, phones: null } } as never)

    const result = await computeTerrainStats(db, 1)

    expect(result.homesCount).toBe(0)
    expect(result.phonesCount).toBe(0)
  })

  it('scopes homes/phones aggregate to residential entrances of the congregation', async () => {
    await computeTerrainStats(db, 42)

    const where = vi.mocked(db.buildingEntrance.aggregate).mock.calls[0][0]?.where
    expect(where).toMatchObject({ congregationId: 42, kind: 'Residential' })
  })

  it('scopes buildings count to buildings inside the territory', async () => {
    await computeTerrainStats(db, 42)

    const where = vi.mocked(db.building.count).mock.calls[0][0]?.where
    expect(where).toMatchObject({ congregationId: 42, inTerritory: true })
  })
})
