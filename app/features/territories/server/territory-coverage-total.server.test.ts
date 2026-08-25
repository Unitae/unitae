import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
  },
}))

const { computeTerritoryCoverageTotal } = await import('./territory-coverage-total.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

const baseArgs: [TerritoryKindKey[], TerritoryAttributionKind[], Date, Date] = [
  [TerritoryKindKey.Classical],
  [TerritoryAttributionKind.Default],
  new Date(2025, 8, 1),
  new Date(2026, 7, 31),
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('computeTerritoryCoverageTotal', () => {
  it('calcule le pourcentage de territoires ayant au moins une attribution', async () => {
    // Premier appel: total, deuxième appel: territoires avec attributions
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(4)

    expect(await computeTerritoryCoverageTotal(db, 1, ...baseArgs)).toBe(40)
  })

  it("retourne 0 quand il n'y a aucun territoire", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    expect(await computeTerritoryCoverageTotal(db, 1, ...baseArgs)).toBe(0)
  })

  it('retourne 100 quand tous les territoires ont des attributions', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(5).mockResolvedValueOnce(5)

    expect(await computeTerritoryCoverageTotal(db, 1, ...baseArgs)).toBe(100)
  })

  it('ne dépasse jamais 100% (contrairement à coverage par attributions)', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(10)

    expect(await computeTerritoryCoverageTotal(db, 1, ...baseArgs)).toBe(100)
  })

  it("n'applique pas de filtre `type` quand territoryKind est vide", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)

    await computeTerritoryCoverageTotal(db, 1, [], baseArgs[1], baseArgs[2], baseArgs[3])

    const totalWhere = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    const touchedWhere = vi.mocked(db.territory.count).mock.calls[1][0]?.where
    expect(totalWhere).not.toHaveProperty('type')
    expect(touchedWhere).not.toHaveProperty('type')
  })

  it('filtre par groupe quand `groupId` est fourni', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(10).mockResolvedValueOnce(2)

    await computeTerritoryCoverageTotal(db, 1, ...baseArgs, 7)

    const totalWhere = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    const touchedWhere = vi.mocked(db.territory.count).mock.calls[1][0]?.where
    // Total territory count must NOT be group-filtered.
    expect(totalWhere).not.toHaveProperty('attributions')
    // The "some attribution from this group" predicate must include publisher filter.
    expect((touchedWhere?.attributions as { some?: Record<string, unknown> })?.some?.publisher).toEqual({
      publisherGroupId: 7,
    })
  })

  it('utilise `lt: startOfNextDay(endDate)` (inclusive end-of-day boundary)', async () => {
    vi.mocked(db.territory.count).mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    await computeTerritoryCoverageTotal(db, 1, ...baseArgs)

    const touchedWhere = vi.mocked(db.territory.count).mock.calls[1][0]?.where
    const some = (touchedWhere?.attributions as { some?: Record<string, unknown> })?.some
    expect(some?.startDate).toEqual({ lt: new Date(2026, 8, 1) })
  })
})
