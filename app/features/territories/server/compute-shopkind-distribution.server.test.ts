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
    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([])
  })

  it('resolves known ShopKind slugs to their localized labels', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: 'alimentaire', _count: { _all: 5 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([{ name: 'Alimentaire', count: 5 }])
  })

  it('passes free-text shopKind through as its trimmed value', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: '  Boulangerie artisanale  ', _count: { _all: 3 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([{ name: 'Boulangerie artisanale', count: 3 }])
  })

  it('groups by resolved label so slug and free-text of the same kind merge together', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: 'alimentaire', _count: { _all: 5 } },
      { shopKind: 'Alimentaire', _count: { _all: 3 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([{ name: 'Alimentaire', count: 8 }])
  })

  it('drops entries whose shopKind is empty or whitespace-only', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: '', _count: { _all: 12 } },
      { shopKind: '   ', _count: { _all: 3 } },
      { shopKind: 'santé-optique', _count: { _all: 4 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([{ name: 'Santé / Optique', count: 4 }])
  })

  it('sorts results by count descending', async () => {
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue([
      { shopKind: 'alimentaire', _count: { _all: 2 } },
      { shopKind: 'restauration-snack-café', _count: { _all: 8 } },
      { shopKind: 'coiffure-cosmetiques', _count: { _all: 5 } },
    ] as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result.map(entry => entry.name)).toEqual([
      'Restaurant / Café / Snack',
      'Coiffure / Cosmétiques',
      'Alimentaire',
    ])
  })

  it('keeps the top 8 entries and buckets the rest into the caller-supplied other label', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      shopKind: `Kind${index}`,
      _count: { _all: 20 - index },
    }))
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

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
    expect(result[8]).toEqual({ name: 'OTHER', count: 42 })
  })

  it('omits the tail bucket when 8 or fewer distinct kinds are present', async () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      shopKind: `Kind${index}`,
      _count: { _all: 8 - index },
    }))
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toHaveLength(8)
    expect(result.every(entry => entry.name !== 'OTHER')).toBe(true)
  })

  it('folds ShopKind.Other into the tail bucket regardless of its rank', async () => {
    // `autre` (ShopKind.Other) resolves to "Autres" and would otherwise appear
    // as its own top-N bar. Since it means the same thing as the tail-bucket
    // "other kinds", both merge into a single entry.
    const entries = [
      { shopKind: 'Kind0', _count: { _all: 20 } },
      { shopKind: 'Kind1', _count: { _all: 15 } },
      { shopKind: 'autre', _count: { _all: 10 } }, // ShopKind.Other → "Autres"
      ...Array.from({ length: 8 }, (_, index) => ({
        shopKind: `Tail${index}`,
        _count: { _all: 5 - Math.min(index, 4) },
      })),
    ]
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    // No standalone "Autres" bar — ShopKind.Other joined the tail bucket.
    expect(result.some(entry => entry.name === 'Autres')).toBe(false)
    const other = result.find(entry => entry.name === 'OTHER')
    expect(other).toBeDefined()
    // Kind0..Tail5 fill the top-8; only Tail6 (1) + Tail7 (1) fall into the
    // tail. Add ShopKind.Other (10) → 12.
    expect(other?.count).toBe(12)
  })

  it('emits the tail bucket even when there are 8 or fewer other kinds, if ShopKind.Other has entries', async () => {
    const entries = [
      { shopKind: 'Kind0', _count: { _all: 5 } },
      { shopKind: 'Kind1', _count: { _all: 3 } },
      { shopKind: 'autre', _count: { _all: 2 } },
    ]
    vi.mocked(db.buildingEntrance.groupBy).mockResolvedValue(entries as never)

    const result = await computeShopKindDistribution(db, 1, 'OTHER')

    expect(result).toEqual([
      { name: 'Kind0', count: 5 },
      { name: 'Kind1', count: 3 },
      { name: 'OTHER', count: 2 },
    ])
  })

  it('scopes the groupBy to commerce entrances of the congregation', async () => {
    await computeShopKindDistribution(db, 42, 'OTHER')

    const args = vi.mocked(db.buildingEntrance.groupBy).mock.calls[0][0]
    expect(args?.where).toMatchObject({ congregationId: 42, kind: 'Commerce' })
    expect(args?.by).toEqual(['shopKind'])
  })
})
