import { describe, expect, it } from 'vitest'
import { parseLocalDate, startOfNextDay } from './date.server'

describe('parseLocalDate', () => {
  it('returns local midnight for a YYYY-MM-DD string', () => {
    const result = parseLocalDate('2025-09-01')
    expect(result).toEqual(new Date(2025, 8, 1))
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('parses leap day correctly', () => {
    const result = parseLocalDate('2024-02-29')
    expect(result).toEqual(new Date(2024, 1, 29))
  })

  it('returns Invalid Date for empty string', () => {
    expect(parseLocalDate('').getTime()).toBeNaN()
  })

  it('returns Invalid Date for unparsable input', () => {
    expect(parseLocalDate('not-a-date').getTime()).toBeNaN()
  })
})

describe('startOfNextDay', () => {
  it('rolls over to the next day at local midnight', () => {
    expect(startOfNextDay(new Date(2025, 8, 1))).toEqual(new Date(2025, 8, 2))
  })

  it('rolls over month-end correctly', () => {
    expect(startOfNextDay(new Date(2025, 7, 31))).toEqual(new Date(2025, 8, 1))
  })

  it('rolls over year-end correctly', () => {
    expect(startOfNextDay(new Date(2025, 11, 31))).toEqual(new Date(2026, 0, 1))
  })

  it('handles leap year Feb 28 → Feb 29', () => {
    expect(startOfNextDay(new Date(2024, 1, 28))).toEqual(new Date(2024, 1, 29))
  })

  it('handles non-leap year Feb 28 → Mar 1', () => {
    expect(startOfNextDay(new Date(2025, 1, 28))).toEqual(new Date(2025, 2, 1))
  })

  it('preserves the time of day at 00:00 regardless of input time', () => {
    const result = startOfNextDay(new Date(2025, 8, 1, 14, 30, 0))
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    expect(result.getDate()).toBe(2)
  })
})
