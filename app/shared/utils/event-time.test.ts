import { describe, expect, it } from 'vitest'
import {
  combineLocalDateTime,
  formatDateForInput,
  formatEventDate,
  formatEventTime,
  formatTimeForInput,
  isValidTimezone,
  parseTimeString,
  setHoursInTimezone,
} from './event-time'

describe('combineLocalDateTime', () => {
  it('returns the UTC instant matching the wall clock in Europe/Paris during summer (CEST, +02:00)', () => {
    const result = combineLocalDateTime('2026-07-15', '17:00', 'Europe/Paris')
    expect(result.toISOString()).toBe('2026-07-15T15:00:00.000Z')
  })

  it('returns the UTC instant matching the wall clock in Europe/Paris during winter (CET, +01:00)', () => {
    const result = combineLocalDateTime('2026-01-15', '17:00', 'Europe/Paris')
    expect(result.toISOString()).toBe('2026-01-15T16:00:00.000Z')
  })

  it('returns the UTC instant matching the wall clock in America/New_York during EST (-05:00)', () => {
    const result = combineLocalDateTime('2026-01-15', '17:00', 'America/New_York')
    expect(result.toISOString()).toBe('2026-01-15T22:00:00.000Z')
  })

  it('returns the UTC instant matching the wall clock in America/New_York during EDT (-04:00)', () => {
    const result = combineLocalDateTime('2026-07-15', '17:00', 'America/New_York')
    expect(result.toISOString()).toBe('2026-07-15T21:00:00.000Z')
  })

  it('round-trips a wall-clock value through the matching timezone formatter', () => {
    const utcDate = combineLocalDateTime('2026-07-15', '19:30', 'Europe/Paris')
    const formatted = utcDate.toLocaleTimeString('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
    })
    expect(formatted).toBe('19:30')
  })

  it('handles UTC as a passthrough', () => {
    const result = combineLocalDateTime('2026-07-15', '17:00', 'UTC')
    expect(result.toISOString()).toBe('2026-07-15T17:00:00.000Z')
  })
})

describe('setHoursInTimezone', () => {
  it('sets the wall-clock hours in the target timezone, preserving the local date', () => {
    const reference = new Date('2026-07-15T10:00:00Z')
    const result = setHoursInTimezone(reference, 19, 30, 'Europe/Paris')
    const formatted = result.toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    expect(formatted).toBe('15/07/2026 19:30')
  })

  it('uses the local date in the target timezone, not the UTC date', () => {
    const reference = new Date('2026-07-15T23:00:00Z')
    const result = setHoursInTimezone(reference, 8, 0, 'America/New_York')
    const formatted = result.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(formatted).toBe('07/15/2026, 08:00')
  })
})

describe('formatEventTime / formatEventDate', () => {
  it('formats a UTC date in the requested timezone', () => {
    const utc = new Date('2026-07-15T15:00:00Z')
    expect(formatEventTime(utc, 'Europe/Paris')).toBe('17:00')
    expect(formatEventTime(utc, 'America/New_York')).toBe('11:00')
  })

  it('accepts ISO strings as input', () => {
    expect(formatEventTime('2026-07-15T15:00:00Z', 'Europe/Paris')).toBe('17:00')
  })

  it('formats event dates with custom options', () => {
    const utc = new Date('2026-07-15T22:00:00Z')
    expect(formatEventDate(utc, 'America/New_York', 'en-US', { weekday: 'long' })).toBe('Wednesday')
  })
})

describe('isValidTimezone', () => {
  it('accepts known IANA zones', () => {
    expect(isValidTimezone('Europe/Paris')).toBe(true)
    expect(isValidTimezone('America/New_York')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isValidTimezone('Not/A/Real/Zone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

describe('parseTimeString', () => {
  it('parses HH:MM into numbers', () => {
    expect(parseTimeString('19:30')).toEqual({ hour: 19, minute: 30 })
    expect(parseTimeString('00:00')).toEqual({ hour: 0, minute: 0 })
    expect(parseTimeString('09:05')).toEqual({ hour: 9, minute: 5 })
  })
})

describe('formatDateForInput', () => {
  it('returns YYYY-MM-DD in the target timezone', () => {
    const utc = new Date('2026-07-15T22:00:00Z')
    expect(formatDateForInput(utc, 'Europe/Paris')).toBe('2026-07-16')
    expect(formatDateForInput(utc, 'America/New_York')).toBe('2026-07-15')
  })
})

describe('formatTimeForInput', () => {
  it('returns HH:MM in the target timezone', () => {
    const utc = new Date('2026-07-15T17:30:00Z')
    expect(formatTimeForInput(utc, 'Europe/Paris')).toBe('19:30')
    expect(formatTimeForInput(utc, 'America/New_York')).toBe('13:30')
  })

  it('handles midnight as 00:00 not 24:00', () => {
    const utc = new Date('2026-07-15T22:00:00Z')
    expect(formatTimeForInput(utc, 'Europe/Paris')).toBe('00:00')
  })
})
