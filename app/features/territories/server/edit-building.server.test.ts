import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { update: vi.fn() },
  },
}))

vi.mock('~/shared/libs/point-in-polygon.server', () => ({
  pointInPolygon: vi.fn(),
}))

vi.mock('./get-territory-polygon.server', () => ({
  getTerritoryPolygon: vi.fn(),
}))

const { editBuilding } = await import('./edit-building.server')
const { db } = await import('~/shared/libs/db.server')
const { pointInPolygon } = await import('~/shared/libs/point-in-polygon.server')
const { getTerritoryPolygon } = await import('./get-territory-polygon.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: false })
})

describe('editBuilding', () => {
  it('met à jour un bâtiment sans coordonnées (inTerritory = true par défaut)', async () => {
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true })

    await editBuilding(1, {
      address: { number: '12', street: 'Rue Test', zip: '75001' },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })

  it('vérifie les coordonnées contre le polygone du territoire', async () => {
    vi.mocked(getTerritoryPolygon).mockResolvedValue([[0, 0], [0, 10], [10, 10], [10, 0]])
    vi.mocked(pointInPolygon).mockReturnValue(true)
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true })

    const result = await editBuilding(1, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
    })

    expect(result.inTerritory).toBe(true)
  })

  it('ne vérifie pas le polygone avec coordonnées partielles', async () => {
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true })

    await editBuilding(1, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5 },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })

  it('considère le bâtiment dans le territoire quand le polygone est vide (non configuré)', async () => {
    vi.mocked(getTerritoryPolygon).mockResolvedValue([])
    vi.mocked(db.building.update).mockResolvedValue({ id: 1, inTerritory: true })

    await editBuilding(1, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
    })

    const callArgs = vi.mocked(db.building.update).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })
})
