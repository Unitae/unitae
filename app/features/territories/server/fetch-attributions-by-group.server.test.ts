import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn() },
  },
}))

const { fetchActiveAttributionsByGroup } = await import('./fetch-attributions-by-group.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('fetchActiveAttributionsByGroup', () => {
  it('retourne les attributions actives regroupées par groupe', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      { publisher: { publisherGroup: { name: 'Groupe A' } } },
      { publisher: { publisherGroup: { name: 'Groupe A' } } },
      { publisher: { publisherGroup: { name: 'Groupe B' } } },
    ] as never)

    const result = await fetchActiveAttributionsByGroup(db, 1)

    expect(result).toEqual([
      { groupName: 'Groupe A', count: 2 },
      { groupName: 'Groupe B', count: 1 },
    ])
  })

  it('regroupe les proclamateurs sans groupe sous "Sans groupe"', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      { publisher: { publisherGroup: null } },
      { publisher: { publisherGroup: { name: 'Groupe A' } } },
    ] as never)

    const result = await fetchActiveAttributionsByGroup(db, 1)

    expect(result).toEqual([
      { groupName: 'Sans groupe', count: 1 },
      { groupName: 'Groupe A', count: 1 },
    ])
  })

  it("retourne un tableau vide quand il n'y a aucune attribution active", async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([])

    const result = await fetchActiveAttributionsByGroup(db, 1)
    expect(result).toEqual([])
  })
})
