import { describe, expect, it, vi } from 'vitest'

import { getManagementMetrics } from './get-management-metrics.server'

const NOW = new Date(2026, 7, 23)

function fakeDb({ territories = 0, active = 0, late = 0, publishers = 0 } = {}) {
  return {
    territory: { count: vi.fn().mockResolvedValue(territories) },
    attribution: {
      count: vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (where.lateDate != null) return Promise.resolve(late)
        return Promise.resolve(active)
      }),
    },
    member: { count: vi.fn().mockResolvedValue(publishers) },
  }
}

describe('getManagementMetrics', () => {
  it('returns territory occupancy and late counts for a territories manager', async () => {
    const db = fakeDb({ territories: 24, active: 18, late: 3 })

    const metrics = await getManagementMetrics(db as never, NOW, {
      includeTerritories: true,
      includePublishers: false,
    })

    expect(metrics.territories).toEqual({ total: 24, assigned: 18, late: 3 })
    expect(metrics.publishers).toBeNull()
    // Late attributions are the still-running ones past their due date.
    expect(db.attribution.count).toHaveBeenCalledWith({
      where: { endDate: null, lateDate: { lt: NOW } },
    })
  })

  it('returns the active publisher count for a publisher manager', async () => {
    const db = fakeDb({ publishers: 57 })

    const metrics = await getManagementMetrics(db as never, NOW, {
      includeTerritories: false,
      includePublishers: true,
    })

    expect(metrics.territories).toBeNull()
    expect(metrics.publishers).toEqual({ total: 57 })
    expect(db.member.count).toHaveBeenCalledWith({
      where: { isPublisher: true, leftAt: null },
    })
    expect(db.territory.count).not.toHaveBeenCalled()
  })

  it('skips every query when nothing is requested', async () => {
    const db = fakeDb()

    const metrics = await getManagementMetrics(db as never, NOW, {
      includeTerritories: false,
      includePublishers: false,
    })

    expect(metrics).toEqual({ territories: null, publishers: null })
    expect(db.territory.count).not.toHaveBeenCalled()
    expect(db.member.count).not.toHaveBeenCalled()
  })
})
