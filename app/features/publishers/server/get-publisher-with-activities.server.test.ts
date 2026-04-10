import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/libs/db.server', () => ({
  db: {
    user: { findMany: vi.fn() },
  },
}))

const { getPublisherWithActivities } = await import('./get-publisher-with-activities.server')
const { db } = await import('~/shared/libs/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPublisherWithActivities', () => {
  it('retourne les proclamateurs avec leurs activités du mois', async () => {
    const fakeResult = [{ id: 1, isPublisher: true, activities: [{ month: 3, year: 2025 }] }]
    vi.mocked(db.user.findMany).mockResolvedValue(fakeResult as never)

    const result = await getPublisherWithActivities(db, 3, 2025)
    expect(result).toEqual(fakeResult)
  })

  it("retourne un tableau vide quand il n'y a pas de résultats", async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([] as never)

    const result = await getPublisherWithActivities(db, 1, 2025)
    expect(result).toEqual([])
  })
})
