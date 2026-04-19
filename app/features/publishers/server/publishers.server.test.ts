import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  db: {
    user: { findMany: vi.fn() },
  },
}))

const { getPublishers, getPublishersWithGroup } = await import('./publishers.server')
const { db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPublishers', () => {
  it('retourne les proclamateurs', async () => {
    const fakePublishers = [
      { id: 1, firstname: 'Jean' },
      { id: 2, firstname: 'Marie' },
    ]
    vi.mocked(db.user.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual(fakePublishers)
  })

  it("retourne un tableau vide quand il n'y a pas de proclamateurs", async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([] as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual([])
  })

  it('accepte un filtre par groupId', async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([{ id: 1 }] as never)

    const result = await getPublishers(db, 1, { groupId: 3 })
    expect(result).toHaveLength(1)
  })
})

describe('getPublishersWithGroup', () => {
  it('retourne les proclamateurs avec leur groupe', async () => {
    const fakePublishers = [{ id: 1, publisherGroup: { name: 'Groupe 1' } }]
    vi.mocked(db.user.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishersWithGroup(db, 1)
    expect(result).toEqual(fakePublishers)
  })
})
