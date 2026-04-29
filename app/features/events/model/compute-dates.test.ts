import { describe, expect, it } from 'vitest'
import { computeDatesForWeekdayCount } from './compute-dates'

describe('computeDatesForWeekdayCount', () => {
  it('returns exactly N dates matching the given weekday', () => {
    const dates = computeDatesForWeekdayCount(2, 5)
    expect(dates.length).toBe(5)
    for (const date of dates) {
      expect(date.getDay()).toBe(2)
    }
  })

  it('returns an empty array for 0 occurrences', () => {
    expect(computeDatesForWeekdayCount(2, 0)).toEqual([])
  })

  it('spaces dates exactly 7 days apart', () => {
    const dates = computeDatesForWeekdayCount(3, 3)
    // biome-ignore lint/style/noNonNullAssertion: array length is guaranteed by computeDatesForWeekdayCount(3, 3)
    expect(dates[1]!.getTime() - dates[0]!.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
    // biome-ignore lint/style/noNonNullAssertion: array length is guaranteed by computeDatesForWeekdayCount(3, 3)
    expect(dates[2]!.getTime() - dates[1]!.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('starts from startFrom date when provided', () => {
    const startFrom = new Date(2026, 5, 1) // Monday June 1
    const dates = computeDatesForWeekdayCount(3, 2, startFrom) // next Wednesday
    expect(dates[0]?.getFullYear()).toBe(2026)
    expect(dates[0]?.getMonth()).toBe(5) // June
    expect(dates[0]?.getDay()).toBe(3) // Wednesday
  })

  it('includes startFrom date itself when it matches the weekday', () => {
    const startFrom = new Date(2026, 5, 3) // Wednesday June 3
    const dates = computeDatesForWeekdayCount(3, 1, startFrom)
    expect(dates[0]?.getDate()).toBe(3)
    expect(dates[0]?.getMonth()).toBe(5)
  })

  it('finds the next occurrence when startFrom does not match the weekday', () => {
    const startFrom = new Date(2026, 5, 1) // Monday June 1
    const dates = computeDatesForWeekdayCount(5, 1, startFrom) // next Friday
    expect(dates[0]?.getDay()).toBe(5)
    expect(dates[0]?.getDate()).toBe(5) // Friday June 5
  })

  it('ignores time component of startFrom', () => {
    const startFrom = new Date(2026, 5, 3, 23, 59, 59) // Wednesday late night
    const dates = computeDatesForWeekdayCount(3, 1, startFrom)
    expect(dates[0]?.getDate()).toBe(3)
    expect(dates[0]?.getHours()).toBe(0)
  })
})
