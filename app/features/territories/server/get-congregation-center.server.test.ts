import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: { building: { aggregate: vi.fn() } },
}))

const { getCongregationCenter } = await import('./get-congregation-center.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getCongregationCenter', () => {
  it('returns the average lat/lng of all buildings in the congregation', async () => {
    vi.mocked(db.building.aggregate).mockResolvedValue({
      _avg: { latitude: 48.8566, longitude: 2.3522 },
    } as never)

    const result = await getCongregationCenter(db as never, 1)
    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('returns null when the congregation has no buildings with coordinates', async () => {
    vi.mocked(db.building.aggregate).mockResolvedValue({
      _avg: { latitude: null, longitude: null },
    } as never)

    const result = await getCongregationCenter(db as never, 1)
    expect(result).toBeNull()
  })

  it('returns null when only one axis is missing (defensive — treat as unusable)', async () => {
    vi.mocked(db.building.aggregate).mockResolvedValue({
      _avg: { latitude: 48.8566, longitude: null },
    } as never)

    const result = await getCongregationCenter(db as never, 1)
    expect(result).toBeNull()
  })

  it('scopes the aggregate query to the requested congregation and skips inactive buildings', async () => {
    vi.mocked(db.building.aggregate).mockResolvedValue({
      _avg: { latitude: 0, longitude: 0 },
    } as never)

    await getCongregationCenter(db as never, 42)

    expect(db.building.aggregate).toHaveBeenCalledWith({
      where: { congregationId: 42, active: true, latitude: { not: null }, longitude: { not: null } },
      _avg: { latitude: true, longitude: true },
    })
  })
})
