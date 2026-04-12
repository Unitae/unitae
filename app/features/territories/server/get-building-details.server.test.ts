import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { findUnique: vi.fn() },
  },
}))

const { getBuildingDetails } = await import('./get-building-details.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getBuildingDetails', () => {
  it('retourne les détails du bâtiment', async () => {
    const fakeBuilding = { id: 1, number: '12', entrances: [{ kind: 'residential', buildings: [], territories: [], accesses: [], residentialData: [] }], residentialData: null }
    vi.mocked(db.building.findUnique).mockResolvedValue(fakeBuilding as never)

    const result = await getBuildingDetails(db, 1)
    expect(result).toEqual(fakeBuilding)
  })

  it("retourne null quand le bâtiment n'existe pas", async () => {
    vi.mocked(db.building.findUnique).mockResolvedValue(null as never)

    const result = await getBuildingDetails(db, 999)
    expect(result).toBeNull()
  })
})
