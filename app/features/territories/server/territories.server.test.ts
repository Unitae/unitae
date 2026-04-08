import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { count: vi.fn(), findMany: vi.fn() },
  },
}))

const { findTerritoriesWithDetailsPaginated, findAvailableTerritoriesPaginated } = await import('./territories.ts')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('findTerritoriesWithDetailsPaginated', () => {
  it('retourne les territoires avec pagination', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(50)
    vi.mocked(db.territory.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }])

    const result = await findTerritoriesWithDetailsPaginated({}, new URL('http://localhost/?page=1&pageSize=25'))

    expect(result.territories).toHaveLength(2)
    expect(result.pagination.total).toBe(50)
    expect(result.pagination.pages).toBe(2)
  })

  it('retourne un résultat vide quand il n\'y a pas de territoires', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)
    vi.mocked(db.territory.findMany).mockResolvedValue([])

    const result = await findTerritoriesWithDetailsPaginated({}, new URL('http://localhost/'))

    expect(result.territories).toEqual([])
    expect(result.pagination.total).toBe(0)
  })
})

describe('findAvailableTerritoriesPaginated', () => {
  it('retourne les territoires disponibles avec pagination', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(10)
    vi.mocked(db.territory.findMany).mockResolvedValue([{ id: 3 }])

    const result = await findAvailableTerritoriesPaginated({}, new URL('http://localhost/'))

    expect(result.territories).toHaveLength(1)
    expect(result.pagination.total).toBe(10)
  })
})
