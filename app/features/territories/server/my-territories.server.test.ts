import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/shared/infra/db.server', () => ({
  unscopedDb: {
    attribution: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}))

const { computeStatus, getUserTerritoriesWithDetails, getUserTerritoryDetail } = await import('./my-territories.server')
const { unscopedDb: db } = await import('~/shared/infra/db.server')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 15)) // 15 April 2025
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('computeStatus', () => {
  it('returns on-time when due date is more than 2 weeks away', () => {
    const lateDate = new Date(2025, 4, 15) // 15 May (30 days away)
    expect(computeStatus(lateDate)).toBe('on-time')
  })

  it('returns due-soon when due date is within 2 weeks', () => {
    const lateDate = new Date(2025, 3, 25) // 25 April (10 days away)
    expect(computeStatus(lateDate)).toBe('due-soon')
  })

  it('returns due-soon at exactly 14 days', () => {
    const lateDate = new Date(2025, 3, 29) // 29 April (14 days away)
    expect(computeStatus(lateDate)).toBe('due-soon')
  })

  it('returns overdue when due date is in the past', () => {
    const lateDate = new Date(2025, 3, 10) // 10 April (5 days ago)
    expect(computeStatus(lateDate)).toBe('overdue')
  })

  it('returns due-soon when due date is today (not yet past)', () => {
    const lateDate = new Date(2025, 3, 15) // today at midnight, same as system time
    expect(computeStatus(lateDate)).toBe('due-soon')
  })
})

describe('getUserTerritoriesWithDetails', () => {
  it('returns empty array when user has no active attributions', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([])

    const result = await getUserTerritoriesWithDetails(db, 42)
    expect(result).toEqual([])
  })

  it('appends computed status to each attribution', async () => {
    vi.mocked(db.attribution.findMany).mockResolvedValue([
      {
        id: 1,
        startDate: new Date(2025, 2, 1),
        lateDate: new Date(2025, 3, 10), // overdue
        type: 'Default',
        territory: { id: 1, number: 'T-1', type: 'doors-to-doors', entrances: [] },
      },
      {
        id: 2,
        startDate: new Date(2025, 3, 1),
        lateDate: new Date(2025, 4, 15), // on-time
        type: 'Phone',
        territory: { id: 2, number: 'T-2', type: 'doors-to-doors', entrances: [] },
      },
    ] as never)

    const result = await getUserTerritoriesWithDetails(db, 1)

    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('overdue')
    expect(result[0].type).toBe('Default')
    expect(result[1].status).toBe('on-time')
    expect(result[1].type).toBe('Phone')
  })
})

describe('getUserTerritoryDetail', () => {
  it('returns null when user has no active attribution for the territory', async () => {
    vi.mocked(db.attribution.findFirst).mockResolvedValue(null)

    const result = await getUserTerritoryDetail(db, 42, 999)
    expect(result).toBeNull()
  })
})
