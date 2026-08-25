import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    territory: { count: vi.fn() },
    attribution: { count: vi.fn() },
  },
}))

const { computeTerritoryCoverage } = await import('./territory-coverage.server')
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

describe('computeTerritoryCoverage', () => {
  it('calcule le pourcentage de couverture', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(10)
    vi.mocked(db.attribution.count).mockResolvedValue(3)

    expect(await computeTerritoryCoverage(db, 1, ...baseArgs)).toBe(30)
  })

  it("retourne 0 quand il n'y a aucun territoire", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(0)
    vi.mocked(db.attribution.count).mockResolvedValue(0)

    expect(await computeTerritoryCoverage(db, 1, ...baseArgs)).toBe(0)
  })

  it('retourne 100 quand toutes les attributions couvrent tous les territoires', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(5)
    vi.mocked(db.attribution.count).mockResolvedValue(5)

    expect(await computeTerritoryCoverage(db, 1, ...baseArgs)).toBe(100)
  })

  it('peut retourner plus de 100% (plusieurs attributions par territoire)', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(5)
    vi.mocked(db.attribution.count).mockResolvedValue(10)

    expect(await computeTerritoryCoverage(db, 1, ...baseArgs)).toBe(200)
  })

  it("n'applique pas de filtre `type` quand territoryKind est vide", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(50)
    vi.mocked(db.attribution.count).mockResolvedValue(25)

    await computeTerritoryCoverage(db, 1, [], baseArgs[1], baseArgs[2], baseArgs[3])

    const territoryWhere = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    const attributionWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    expect(territoryWhere).not.toHaveProperty('type')
    expect(attributionWhere).not.toHaveProperty('territory')
  })

  it('filtre par groupe quand `groupId` est fourni', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(10)
    vi.mocked(db.attribution.count).mockResolvedValue(2)

    await computeTerritoryCoverage(db, 1, ...baseArgs, 42)

    const territoryWhere = vi.mocked(db.territory.count).mock.calls[0][0]?.where
    const attributionWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    // Total territory count must NOT be group-filtered (territories aren't owned by groups).
    expect(territoryWhere).not.toHaveProperty('publisher')
    // Attribution count must be group-filtered.
    expect(attributionWhere?.publisher).toEqual({ publisherGroupId: 42 })
  })

  it("n'applique pas de filtre de groupe par défaut", async () => {
    vi.mocked(db.territory.count).mockResolvedValue(10)
    vi.mocked(db.attribution.count).mockResolvedValue(2)

    await computeTerritoryCoverage(db, 1, ...baseArgs)

    const attributionWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    expect(attributionWhere).not.toHaveProperty('publisher')
  })

  it('utilise `lt: startOfNextDay(endDate)` (inclusive end-of-day boundary)', async () => {
    vi.mocked(db.territory.count).mockResolvedValue(1)
    vi.mocked(db.attribution.count).mockResolvedValue(0)

    await computeTerritoryCoverage(db, 1, ...baseArgs)

    const attributionWhere = vi.mocked(db.attribution.count).mock.calls[0][0]?.where
    expect(attributionWhere?.startDate).toEqual({ lt: new Date(2026, 8, 1) })
  })
})
