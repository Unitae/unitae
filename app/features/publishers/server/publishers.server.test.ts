import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    user: { findMany: vi.fn() },
  },
}))

const { getPublishers, getPublishersWithGroup } = await import('./publishers.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPublishers', () => {
  it('retourne les proclamateurs', async () => {
    const fakePublishers = [
      { id: 1, firstname: 'Jean' },
      { id: 2, firstname: 'Marie' },
    ]
    vi.mocked(db.userAccount.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual(fakePublishers)
  })

  it("retourne un tableau vide quand il n'y a pas de proclamateurs", async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([] as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual([])
  })

  it('accepte un filtre par groupId', async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([{ id: 1 }] as never)

    const result = await getPublishers(db, 1, { groupId: 3 })
    expect(result).toHaveLength(1)
  })
})

describe('getPublishersWithGroup', () => {
  it('retourne les proclamateurs avec leur groupe', async () => {
    const fakePublishers = [{ id: 1, publisherGroup: { name: 'Groupe 1' } }]
    vi.mocked(db.userAccount.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishersWithGroup(db, 1)
    expect(result).toEqual(fakePublishers)
  })

  it('applies a case-insensitive OR filter on firstname and lastname when search is provided', async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, { search: 'jean' })

    const where = vi.mocked(db.userAccount.findMany).mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({
      OR: [
        { firstname: { contains: 'jean', mode: 'insensitive' } },
        { lastname: { contains: 'jean', mode: 'insensitive' } },
      ],
    })
  })

  it('does not apply an OR filter when search is absent', async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1)

    const where = vi.mocked(db.userAccount.findMany).mock.calls[0]?.[0]?.where
    expect(where).not.toHaveProperty('OR')
  })

  it('returns an empty array when no publisher matches the search', async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([] as never)

    const result = await getPublishersWithGroup(db, 1, { search: 'zzz-no-match' })
    expect(result).toEqual([])
  })
})
