import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    territory: { count: vi.fn() },
  },
}))

const { computeTerritoryCoverageTotal } = await import('./territory-coverage-total.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('computeTerritoryCoverageTotal', () => {
  it('calcule le pourcentage de territoires ayant au moins une attribution', async () => {
    // Premier appel: total, deuxième appel: territoires avec attributions
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(4)

    const result = await computeTerritoryCoverageTotal(db)
    expect(result).toBe(40)
  })

  it("retourne 0 quand il n'y a aucun territoire", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    const result = await computeTerritoryCoverageTotal(db)
    expect(result).toBe(0)
  })

  it('retourne 100 quand tous les territoires ont des attributions', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(5).mockResolvedValueOnce(5)

    const result = await computeTerritoryCoverageTotal(db)
    expect(result).toBe(100)
  })

  it('ne dépasse jamais 100% (contrairement à coverage par attributions)', async () => {
    // Chaque territoire ne peut être compté qu'une fois
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(10)

    const result = await computeTerritoryCoverageTotal(db)
    expect(result).toBe(100)
  })

  it('accepte un filtre startDate', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(3)

    const startDate = new Date(2025, 0, 1)
    const result = await computeTerritoryCoverageTotal(db as any, undefined, undefined, startDate)
    expect(result).toBe(30)
  })

  it('accepte startDate et endDate combinés', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(7)

    const startDate = new Date(2025, 0, 1)
    const endDate = new Date(2025, 11, 31)
    const result = await computeTerritoryCoverageTotal(db as any, undefined, undefined, startDate, endDate)
    expect(result).toBe(70)
  })
})
