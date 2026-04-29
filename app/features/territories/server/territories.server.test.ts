import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn(), findMany: vi.fn() },
  },
}))

const { findTerritoriesWithDetailsPaginated, findAvailableTerritoriesPaginated } = await import('./territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('findTerritoriesWithDetailsPaginated', () => {
  it('retourne les territoires avec pagination', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(50 as never)
    vi.mocked(db.territory.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as never)

    const result = await findTerritoriesWithDetailsPaginated(db, {}, new URL('http://localhost/?page=1&pageSize=25'), 1)

    expect(result.territories).toHaveLength(2)
    expect(result.pagination.total).toBe(50)
    expect(result.pagination.pages).toBe(2)
  })

  it("retourne un résultat vide quand il n'y a pas de territoires", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0 as never)
    vi.mocked(db.territory.findMany).mockResolvedValue([] as never)

    const result = await findTerritoriesWithDetailsPaginated(db, {}, new URL('http://localhost/'), 1)

    expect(result.territories).toEqual([])
    expect(result.pagination.total).toBe(0)
  })
})

describe('findAvailableTerritoriesPaginated', () => {
  it('retourne les territoires disponibles avec pagination', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(10 as never)
    vi.mocked(db.territory.findMany).mockResolvedValue([{ id: 3 }] as never)

    const result = await findAvailableTerritoriesPaginated(db, {}, new URL('http://localhost/'), 1)

    expect(result.territories).toHaveLength(1)
    expect(result.pagination.total).toBe(10)
  })
})
