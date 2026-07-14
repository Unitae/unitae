import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublisherType } from '~/shared/types/publisher-type'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
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

describe('getPublishersWithGroup', () => {
  it('retourne les proclamateurs avec leur groupe', async () => {
    const fakePublishers = [{ id: 1, publisherGroup: { name: 'Groupe 1' } }]
    vi.mocked(db.member.findMany).mockResolvedValue(fakePublishers as never)

    const result = await getPublishersWithGroup(db, 1)
    expect(result).toEqual(fakePublishers)
  })

  it('applies a case-insensitive OR filter on firstname and lastname when search is provided', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, { search: 'jean' })

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({
      OR: [
        { firstname: { contains: 'jean', mode: 'insensitive' } },
        { lastname: { contains: 'jean', mode: 'insensitive' } },
      ],
    })
  })

  it('does not apply an OR filter when search is absent', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1)

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).not.toHaveProperty('OR')
  })

  it('returns an empty array when no publisher matches the search', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    const result = await getPublishersWithGroup(db, 1, { search: 'zzz-no-match' })
    expect(result).toEqual([])
  })

  it('narrows the where clause to the provided groupIds', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, { groupIds: [10, 20] })

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({ publisherGroupId: { in: [10, 20] } })
  })

  it('does not add a group filter when groupIds is empty', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, { groupIds: [] })

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).not.toHaveProperty('publisherGroupId')
  })

  it('narrows the where clause to the provided publisher type', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, { type: PublisherType.PionnierPermanant })

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({ type: PublisherType.PionnierPermanant })
  })

  it('combines search, group and type filters', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)
    await getPublishersWithGroup(db, 1, {
      search: 'jean',
      groupIds: [42],
      type: PublisherType.Normal,
    })

    const where = vi.mocked(db.member.findMany).mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({
      isPublisher: true,
      leftAt: null,
      publisherGroupId: { in: [42] },
      type: PublisherType.Normal,
      OR: [
        { firstname: { contains: 'jean', mode: 'insensitive' } },
        { lastname: { contains: 'jean', mode: 'insensitive' } },
      ],
    })
  })
})
