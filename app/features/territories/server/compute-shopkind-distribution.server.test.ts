import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    buildingEntrance: { groupBy: vi.fn() },
  },
}))

const { computeShopKindDistribution } = await import('./compute-shopkind-distribution.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([] as never)
})

describe('computeShopKindDistribution', () => {
  it('returns an empty list when no commerce entrances exist', async () => {
    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result).toEqual([])
  })

  it('groups entries by lowercase+trimmed shopKind while keeping the winner original casing', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: 'Boulangerie', _count: { _all: 3 } },
      { shopKind: ' boulangerie ', _count: { _all: 5 } },
      { shopKind: 'BOULANGERIE', _count: { _all: 1 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result).toEqual([{ name: ' boulangerie ', count: 9 }])
  })

  it('drops entries whose shopKind is empty or whitespace-only', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: '', _count: { _all: 12 } },
      { shopKind: '   ', _count: { _all: 3 } },
      { shopKind: 'Pharmacie', _count: { _all: 4 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result).toEqual([{ name: 'Pharmacie', count: 4 }])
  })

  it('sorts results by count descending', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: 'Pharmacie', _count: { _all: 2 } },
      { shopKind: 'Boulangerie', _count: { _all: 8 } },
      { shopKind: 'Café', _count: { _all: 5 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result.map(entry => entry.name)).toEqual(['Boulangerie', 'Café', 'Pharmacie'])
  })

  it('keeps the top 8 entries and buckets the rest into "Autre"', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      shopKind: `Kind${index}`,
      _count: { _all: 20 - index },
    }))
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result).toHaveLength(9)
    expect(result.slice(0, 8).map(entry => entry.name)).toEqual([
      'Kind0',
      'Kind1',
      'Kind2',
      'Kind3',
      'Kind4',
      'Kind5',
      'Kind6',
      'Kind7',
    ])
    // Tail is Kind8..Kind11 with counts 12..9 → sum 42
    expect(result[8]).toEqual({ name: 'Autre', count: 42 })
  })

  it('omits the "Autre" bucket when 8 or fewer distinct kinds are present', async () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      shopKind: `Kind${index}`,
      _count: { _all: 8 - index },
    }))
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'Autre')

    expect(result).toHaveLength(8)
    expect(result.every(entry => entry.name !== 'Autre')).toBe(true)
  })

  it('scopes the groupBy to commerce entrances of the congregation', async () => {
    await computeShopKindDistribution(db, 42, 'Autre')

    const args = vi.mocked(db.buildingEntrance.groupBy).mock.calls[0][0]
    expect(args?.where).toMatchObject({ congregationId: 42, kind: 'Commerce' })
    expect(args?.by).toEqual(['shopKind'])
  })
})
