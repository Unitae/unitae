import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

const { getPublishers } = await import('./publishers.server')
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
    vi.mocked(db.member.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual(fakePublishers)
  })

  it("retourne un tableau vide quand il n'y a pas de proclamateurs", async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    const result = await getPublishers(db, 1)
    expect(result).toEqual([])
  })

  it('accepte un filtre par groupId', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([{ id: 1 }] as never)

    const result = await getPublishers(db, 1, { groupId: 3 })
    expect(result).toHaveLength(1)
  })
})
