import { describe, expect, it } from 'vitest'
import { formatActivityMonth, formatShortMonth, REPORT_WINDOW_LENGTH, reportWindow } from './activity-months'

describe('reportWindow', () => {
  it('lists the last six ended months, oldest first, ending with the month being reported', () => {
    expect(reportWindow(new Date(2026, 10, 3))).toEqual([
      { month: 4, year: 2026 },
      { month: 5, year: 2026 },
      { month: 6, year: 2026 },
      { month: 7, year: 2026 },
      { month: 8, year: 2026 },
      { month: 9, year: 2026 },
    ])
  })

  it('has as many months as the strip shows', () => {
    expect(reportWindow(new Date(2026, 5, 15))).toHaveLength(REPORT_WINDOW_LENGTH)
  })

  // Regression: `setMonth(getMonth() - 1)` keeps the day of the month, so on a 31st after a 30-day
  // month it rolled over into the current month.
  it.each([
    [new Date(2026, 4, 31), 3],
    [new Date(2026, 9, 31), 8],
    [new Date(2026, 2, 30), 1],
  ])('ends with the previous month on %s even when it is shorter', (now, reported) => {
    expect(reportWindow(now).at(-1)?.month).toBe(reported)
  })

  it('crosses into the previous year in January', () => {
    const window = reportWindow(new Date(2026, 0, 10))
    expect(window[0]).toEqual({ month: 6, year: 2025 })
    expect(window.at(-1)).toEqual({ month: 11, year: 2025 })
  })
})

describe('formatActivityMonth', () => {
  it('names the month and year in the given locale', () => {
    expect(formatActivityMonth({ month: 9, year: 2026 }, 'en')).toBe('Oct 2026')
  })

  it('writes the month in full when asked', () => {
    expect(formatActivityMonth({ month: 2, year: 2026 }, 'fr', 'long')).toBe('mars 2026')
  })
})

describe('formatShortMonth', () => {
  // The column heading on a phone, where « Rapport (oct. 2026) » does not fit.
  it('names the month alone, abbreviated', () => {
    expect(formatShortMonth({ month: 9, year: 2026 }, 'fr')).toBe('oct.')
  })
})
