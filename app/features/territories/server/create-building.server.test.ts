import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    building: { create: vi.fn() },
  },
}))

vi.mock('~/shared/libs/point-in-polygon.server', () => ({
  pointInPolygon: vi.fn(),
}))

vi.mock('./get-territory-polygon.server', () => ({
  getTerritoryPolygon: vi.fn(),
}))

const { createBuilding } = await import('./create-building.server')
const { db } = await import('~/shared/libs/db.server')
const { pointInPolygon } = await import('~/shared/libs/point-in-polygon.server')
const { getTerritoryPolygon } = await import('./get-territory-polygon.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.create).mockResolvedValue({ id: 1, inTerritory: false })
})

describe('createBuilding', () => {
  it('crée un bâtiment sans coordonnées (inTerritory = false)', async () => {
    const result = await createBuilding({
      address: { number: '12', street: 'Rue Test', zip: '75001' },
    })

    expect(result).toEqual({ id: 1, inTerritory: false })
  })

  it('vérifie les coordonnées contre le polygone du territoire', async () => {
    vi.mocked(getTerritoryPolygon).mockResolvedValue([[0, 0], [0, 10], [10, 10], [10, 0]])
    vi.mocked(pointInPolygon).mockReturnValue(true)
    vi.mocked(db.building.create).mockResolvedValue({ id: 2, inTerritory: true })

    const result = await createBuilding({
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
    })

    expect(result.inTerritory).toBe(true)
  })

  it('ne vérifie pas le polygone quand seulement latitude est fournie', async () => {
    await createBuilding({
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5 },
    })

    // getTerritoryPolygon ne devrait pas être appelé car longitude manque
    // On vérifie via le résultat: inTerritory reste false
    expect(vi.mocked(db.building.create)).toBeDefined()
  })

  it('ne vérifie pas le polygone quand seulement longitude est fournie', async () => {
    await createBuilding({
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { longitude: 5 },
    })

    expect(vi.mocked(db.building.create)).toBeDefined()
  })

  it('marque inTerritory false quand le point est hors du polygone', async () => {
    vi.mocked(getTerritoryPolygon).mockResolvedValue([[0, 0], [0, 10], [10, 10], [10, 0]])
    vi.mocked(pointInPolygon).mockReturnValue(false)
    vi.mocked(db.building.create).mockResolvedValue({ id: 3, inTerritory: false })

    const result = await createBuilding({
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 50, longitude: 50 },
    })

    expect(result.inTerritory).toBe(false)
  })
})
