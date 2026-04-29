import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    setting: { findFirst: vi.fn() },
  },
}))

const { getTerritoryPolygon } = await import('./get-territory-polygon.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getTerritoryPolygon', () => {
  it("retourne un tableau vide quand le setting n'existe pas", async () => {
    vi.mocked(db.setting.findFirst).mockResolvedValue(null as never)

    const result = await getTerritoryPolygon(db)
    expect(result).toEqual([])
  })

  it('parse le JSON du setting en polygone', async () => {
    const polygon = [
      [48.8566, 2.3522],
      [48.8567, 2.3523],
      [48.8568, 2.3524],
    ]
    vi.mocked(db.setting.findFirst).mockResolvedValue({
      key: 'territory',
      value: JSON.stringify(polygon),
    } as never)

    const result = await getTerritoryPolygon(db)
    expect(result).toEqual(polygon)
  })
})
