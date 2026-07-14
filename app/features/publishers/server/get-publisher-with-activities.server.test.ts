import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    member: { findMany: vi.fn() },
  },
}))

const { getPublisherWithActivities } = await import('./get-publisher-with-activities.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

function whereFromLastCall() {
  const args = vi.mocked(db.member.findMany).mock.calls.at(-1)?.[0]
  return args?.where as {
    leftAt?: unknown
    OR?: Record<string, unknown>[]
  } & Record<string, unknown>
}

describe('getPublisherWithActivities', () => {
  it('retourne les proclamateurs avec leurs activités du mois', async () => {
    const fakeResult = [{ id: 1, isPublisher: true, activities: [{ month: 3, year: 2025 }] }]
    vi.mocked(db.member.findMany).mockResolvedValue(fakeResult as never)

    const result = await getPublisherWithActivities(db, 1, 3, 2025)
    expect(result).toEqual(fakeResult)
  })

  it("retourne un tableau vide quand il n'y a pas de résultats", async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    const result = await getPublisherWithActivities(db, 1, 1, 2025)
    expect(result).toEqual([])
  })

  it('inclut les membres partis (leftAt) qui ont une activité pour le mois demandé', async () => {
    // Regression: the query previously filtered every result on `leftAt: null`,
    // hiding historical reports the moment a member was marked as having left.
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    await getPublisherWithActivities(db, 1, 3, 2025)

    const where = whereFromLastCall()
    expect(where).not.toHaveProperty('leftAt')

    const activityBranch = where.OR?.find(branch => 'activities' in branch)
    expect(activityBranch).toBeDefined()
    expect(activityBranch).not.toHaveProperty('leftAt')
    expect(activityBranch?.activities).toEqual({ some: { year: 2025, month: 3 } })
  })

  it('inclut les proclamateurs actifs indépendamment de leur activité du mois', async () => {
    vi.mocked(db.member.findMany).mockResolvedValue([] as never)

    await getPublisherWithActivities(db, 1, 3, 2025)

    const where = whereFromLastCall()
    const publisherBranch = where.OR?.find(branch => branch.isPublisher === true)
    expect(publisherBranch).toEqual({ leftAt: null, isPublisher: true })
  })
})
