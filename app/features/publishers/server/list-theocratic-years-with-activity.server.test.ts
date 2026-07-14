import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    publisherActivity: { groupBy: vi.fn() },
  },
}))

const { listTheocraticYearsWithActivity } = await import('./list-theocratic-years-with-activity.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.resetAllMocks()
})

function row(year: number, month: number) {
  return { year, month } as never
}

describe('listTheocraticYearsWithActivity', () => {
  it('returns an empty array when no activity exists', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([])

    const result = await listTheocraticYearsWithActivity(db, 1)

    expect(result).toEqual([])
  })

  it('maps months >= August to the theocratic year that started in that calendar year', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([row(2025, 8), row(2025, 11)])

    const result = await listTheocraticYearsWithActivity(db, 1)

    expect(result).toEqual([2025])
  })

  it('maps months < August to the theocratic year that started the previous calendar year', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([row(2026, 3), row(2026, 7)])

    const result = await listTheocraticYearsWithActivity(db, 1)

    expect(result).toEqual([2025])
  })

  it('deduplicates and returns theocratic years in descending order', async () => {
    vi.mocked(db.publisherActivity.groupBy).mockResolvedValue([row(2025, 8), row(2026, 3), row(2026, 8), row(2024, 11)])

    const result = await listTheocraticYearsWithActivity(db, 1)

    expect(result).toEqual([2026, 2025, 2024])
  })
})
