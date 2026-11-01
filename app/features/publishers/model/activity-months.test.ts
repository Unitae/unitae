import { describe, expect, it } from 'vitest'
import { activityMonths, formatActivityMonth } from './activity-months'

describe('activityMonths', () => {
  it('pairs the current month with the one before it', () => {
    expect(activityMonths(new Date(2026, 6, 15))).toEqual({
      current: { month: 6, year: 2026 },
      previous: { month: 5, year: 2026 },
    })
  })

  // Regression: `setMonth(getMonth() - 1)` keeps the day of the month, so on a 31st after a 30-day
  // month it rolled over into the current month, and both columns showed the same one.
  it.each([
    [new Date(2026, 4, 31), 3],
    [new Date(2026, 9, 31), 8],
    [new Date(2026, 2, 30), 1],
  ])('takes the previous month on %s even when it is shorter', (now, previous) => {
    expect(activityMonths(now).previous.month).toBe(previous)
  })

  it('crosses into the previous year in January', () => {
    expect(activityMonths(new Date(2026, 0, 10)).previous).toEqual({ month: 11, year: 2025 })
  })
})

describe('formatActivityMonth', () => {
  it('names the month and year in the given locale', () => {
    expect(formatActivityMonth({ month: 9, year: 2026 }, 'en')).toBe('Oct 2026')
  })
})
