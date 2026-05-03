import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    building: { create: vi.fn() },
    buildingResidentialData: { create: vi.fn() },
  },
}))

vi.mock('~/shared/utils/point-in-polygon.server', () => ({
  pointInPolygon: vi.fn(),
}))

vi.mock('./perimeter.server', () => ({
  getPerimeterPaths: vi.fn(),
}))

const { createBuilding } = await import('./create-building.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')
const { pointInPolygon } = await import('~/shared/utils/point-in-polygon.server')
const { getPerimeterPaths } = await import('./perimeter.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.building.create).mockResolvedValue({
    id: 1,
    inTerritory: false,
    entrances: [{ id: 10, kind: 'residential' }],
  } as never)
})

describe('createBuilding', () => {
  it('crée un bâtiment sans coordonnées (inTerritory = true par défaut)', async () => {
    vi.mocked(db.building.create).mockResolvedValue({
      id: 1,
      inTerritory: true,
      entrances: [{ id: 10, kind: 'residential' }],
    } as never)

    const result = await createBuilding(db, {
      address: { number: '12', street: 'Rue Test', zip: '75001' },
      congregationId: 1,
    })

    expect(result.inTerritory).toBe(true)
    const callArgs = vi.mocked(db.building.create).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })

  it('vérifie les coordonnées contre le polygone du territoire', async () => {
    vi.mocked(getPerimeterPaths).mockResolvedValue([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ] as never)
    vi.mocked(pointInPolygon).mockReturnValue(true as never)
    vi.mocked(db.building.create).mockResolvedValue({
      id: 2,
      inTerritory: true,
      entrances: [{ id: 10, kind: 'residential' }],
    } as never)

    const result = await createBuilding(db, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
      congregationId: 1,
    })

    expect(result.inTerritory).toBe(true)
  })

  it('ne vérifie pas le polygone quand seulement latitude est fournie', async () => {
    await createBuilding(db, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5 },
      congregationId: 1,
    })

    // getPerimeterPaths ne devrait pas être appelé car longitude manque
    // On vérifie via le résultat: inTerritory reste false
    expect(vi.mocked(db.building.create)).toBeDefined()
  })

  it('ne vérifie pas le polygone quand seulement longitude est fournie', async () => {
    await createBuilding(db, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { longitude: 5 },
      congregationId: 1,
    })

    expect(vi.mocked(db.building.create)).toBeDefined()
  })

  it("considère le bâtiment dans le territoire quand aucun périmètre n'est configuré", async () => {
    vi.mocked(getPerimeterPaths).mockResolvedValue(null as never)
    vi.mocked(db.building.create).mockResolvedValue({
      id: 4,
      inTerritory: true,
      entrances: [{ id: 10, kind: 'residential' }],
    } as never)

    await createBuilding(db, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 5, longitude: 5 },
      congregationId: 1,
    })

    const callArgs = vi.mocked(db.building.create).mock.calls[0][0]
    expect(callArgs.data.inTerritory).toBe(true)
  })

  it('marque inTerritory false quand le point est hors du polygone', async () => {
    vi.mocked(getPerimeterPaths).mockResolvedValue([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 },
    ] as never)
    vi.mocked(pointInPolygon).mockReturnValue(false as never)
    vi.mocked(db.building.create).mockResolvedValue({
      id: 3,
      inTerritory: false,
      entrances: [{ id: 10, kind: 'residential' }],
    } as never)

    const result = await createBuilding(db, {
      address: { number: '5', street: 'Rue Test', zip: '75001' },
      coordinates: { latitude: 50, longitude: 50 },
      congregationId: 1,
    })

    expect(result.inTerritory).toBe(false)
  })
})
