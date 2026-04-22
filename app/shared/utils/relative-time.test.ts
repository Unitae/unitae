import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatAbsoluteDate, formatRelativeTime } from './relative-time'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 3, 15, 12, 0, 0)) // 15 April 2025, noon
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatRelativeTime', () => {
  it('returns "now" for dates within a minute', () => {
    const date = new Date(2025, 3, 15, 11, 59, 30) // 30 seconds ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('now')
  })

  it('returns minutes for dates within an hour', () => {
    const date = new Date(2025, 3, 15, 11, 45, 0) // 15 minutes ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('15')
    expect(result).toContain('minute')
  })

  it('returns hours for dates within a day', () => {
    const date = new Date(2025, 3, 15, 9, 0, 0) // 3 hours ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('3')
    expect(result).toContain('hour')
  })

  it('returns days for dates within a week', () => {
    const date = new Date(2025, 3, 12, 12, 0, 0) // 3 days ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('3')
    expect(result).toContain('day')
  })

  it('returns weeks for dates within a month', () => {
    const date = new Date(2025, 3, 1, 12, 0, 0) // 2 weeks ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('2')
    expect(result).toContain('week')
  })

  it('falls back to absolute date for dates over a year', () => {
    const date = new Date(2023, 3, 15, 12, 0, 0) // 2 years ago
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('2023')
  })

  it('handles future dates', () => {
    const date = new Date(2025, 3, 18, 12, 0, 0) // 3 days from now
    const result = formatRelativeTime(date, 'en')
    expect(result).toContain('3')
    expect(result).toContain('day')
  })

  it('handles string input', () => {
    const result = formatRelativeTime('2025-04-12T12:00:00Z', 'en')
    expect(result).toContain('day')
  })
})

describe('formatAbsoluteDate', () => {
  it('formats a Date object', () => {
    const date = new Date(2025, 3, 15)
    const result = formatAbsoluteDate(date, 'en')
    expect(result).toContain('April')
    expect(result).toContain('15')
    expect(result).toContain('2025')
  })

  it('formats a string date', () => {
    const result = formatAbsoluteDate('2025-04-15', 'en')
    expect(result).toContain('2025')
  })
})
