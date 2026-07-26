import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { update: vi.fn() },
  },
}))

vi.mock('~/shared/utils/point-in-polygon.server', () => ({
  pointInPolygon: vi.fn(),
}))

vi.mock('./perimeter.server', () => ({
  getPerimeterPaths: vi.fn(),
}))

vi.mock('./update-buildings-in-entrance.server', () => ({
  recalculateEntranceCentroid: vi.fn(),
}))

const { editBuilding } = await import('./edit-building.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { pointInPolygon } = await import('~/shared/utils/point-in-polygon.server')
const { getPerimeterPaths } = await import('./perimeter.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: false, entrances: [] } as never)
})

describe('editBuilding', () => {
  it('met à jour un bâtiment sans coordonnées (inTerritory = true par défaut)', async () => {
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true, entrances: [] } as never)

    await editBuilding(db, 1, 42, {
      address: { number: '12', street: 'Rue Test', zip: '75001' },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
    expect(callArgs.where).toEqual({ id_congregationId: { id: 1, congregationId: 42 } })
  })

  it('vérifie les coordonnées contre le polygone du territoire', async () => {
    vi.mocked(getPerimeterPaths).mockResolvedValue([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ] as never)
    vi.mocked(pointInPolygon).mockReturnValue(true as never)
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true, entrances: [] } as never)

    const result = await editBuilding(db, 1, 42, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
    })

    expect(result.inTerritory).toBe(true)
  })

  it('ne vérifie pas le polygone avec coordonnées partielles', async () => {
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true, entrances: [] } as never)

    await editBuilding(db, 1, 42, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5 },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })

  it("considère le bâtiment dans le territoire quand aucun périmètre n'est configuré", async () => {
    vi.mocked(getPerimeterPaths).mockResolvedValue(null as never)
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true, entrances: [] } as never)

    await editBuilding(db, 1, 42, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })
})
