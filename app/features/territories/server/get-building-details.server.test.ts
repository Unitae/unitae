import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { findUnique: vi.fn() },
  },
}))

const { getBuildingDetails } = await import('./get-building-details.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getBuildingDetails', () => {
  it('retourne les détails du bâtiment', async () => {
    const fakeBuilding = {
      id: 1,
      number: '12',
      entrances: [{ kind: 'residential', buildings: [], territories: [], accesses: [], residentialData: [] }],
      residentialData: null,
    }
    vi.mocked(db.building.findUnique).mockResolvedValue(fakeBuilding as never)

    const result = await getBuildingDetails(db, 1, 42)
    expect(result).toEqual(fakeBuilding)
    expect(db.building.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_congregationId: { id: 1, congregationId: 42 } } }),
    )
  })

  it("retourne null quand le bâtiment n'existe pas", async () => {
    vi.mocked(db.building.findUnique).mockResolvedValue(null as never)

    const result = await getBuildingDetails(db, 999, 42)
    expect(result).toBeNull()
  })
})
