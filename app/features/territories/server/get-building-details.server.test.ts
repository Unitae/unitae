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
    const fakeBuilding = { id: 1, number: '12', entrance: { buildings: [], territories: [] } }
    vi.mocked(db.building.findUnique).mockResolvedValue(fakeBuilding)

    const result = await getBuildingDetails(1)
    expect(result).toEqual(fakeBuilding)
  })

  it('retourne null quand le bâtiment n\'existe pas', async () => {
    vi.mocked(db.building.findUnique).mockResolvedValue(null)

    const result = await getBuildingDetails(999)
    expect(result).toBeNull()
  })
})
