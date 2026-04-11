import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    attribution: { count: vi.fn(), findMany: vi.fn() },
    territory: { findUnique: vi.fn() },
  },
}))

vi.mock('~/shared/libs/pagination.server', () => ({
  paginationFromUrl: vi.fn(() => ({ offset: 0, size: 25, page: 1, pages: 1, total: 0 })),
}))

const { findActiveAttributionsForPublisher, findTerritoryWithHistory } = await import('./attributions')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('findActiveAttributionsForPublisher', () => {
  it('retourne les attributions actives avec le territoire inclus', async () => {
    const fakeAttributions = [
      { id: 1, publisherId: 42, endDate: null, territory: { id: 10, number: 'T-1' } },
      { id: 2, publisherId: 42, endDate: null, territory: { id: 20, number: 'T-2' } },
    ]
    vi.mocked(db.attribution.findMany).mockResolvedValue(fakeAttributions as never)

    const result = await findActiveAttributionsForPublisher(db, 42)

    expect(result).toEqual(fakeAttributions)
    expect(db.attribution.findMany).toHaveBeenCalledWith({
      where: { publisherId: 42, endDate: null },
      include: { territory: true },
      orderBy: [{ startDate: 'asc' }],
    })
  })

  it("retourne un tableau vide quand le proclamateur n'a pas d'attribution", async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([])

    const result = await findActiveAttributionsForPublisher(db, 99)

    expect(result).toEqual([])
  })
})

describe('findTerritoryWithHistory', () => {
  it('retourne le territoire avec ses allées et toutes les attributions', async () => {
    const fakeTerritory = {
      id: 10,
      number: 'T-1',
      entrances: [{ id: 1, buildings: [{ id: 1, active: true }] }],
      attributions: [
        { id: 1, endDate: null, publisher: { id: 42, firstname: 'Jean' } },
        { id: 2, endDate: new Date('2025-01-15'), publisher: { id: 43, firstname: 'Paul' } },
      ],
    }
    vi.mocked(db.territory.findUnique).mockResolvedValue(fakeTerritory as never)

    const result = await findTerritoryWithHistory(db, 10)

    expect(result).toEqual(fakeTerritory)
    expect(db.territory.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      include: {
        entrances: { include: { buildings: { where: { active: true } } } },
        attributions: {
          include: { publisher: true },
          orderBy: [{ startDate: 'desc' }],
        },
      },
    })
  })

  it("retourne null quand le territoire n'existe pas", async () => {
    vi.mocked(db.territory.findUnique).mockResolvedValue(null)

    const result = await findTerritoryWithHistory(db, 999)

    expect(result).toBeNull()
  })
})
