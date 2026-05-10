import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    user: { findMany: vi.fn() },
  },
}))

const { getPublisherWithActivities } = await import('./get-publisher-with-activities.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('getPublisherWithActivities', () => {
  it('retourne les proclamateurs avec leurs activités du mois', async () => {
    const fakeResult = [{ id: 1, isPublisher: true, activities: [{ month: 3, year: 2025 }] }]
    vi.mocked(db.userAccount.findMany).mockResolvedValue(fakeResult as never)

    const result = await getPublisherWithActivities(db, 1, 3, 2025)
    expect(result).toEqual(fakeResult)
  })

  it("retourne un tableau vide quand il n'y a pas de résultats", async () => {
    vi.mocked(db.userAccount.findMany).mockResolvedValue([] as never)

    const result = await getPublisherWithActivities(db, 1, 1, 2025)
    expect(result).toEqual([])
  })
})
