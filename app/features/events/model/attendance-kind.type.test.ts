import { describe, expect, it } from 'vitest'
import {
  AttendanceKind,
  countsInAverages,
  defaultAttendanceKind,
  isAttendanceKind,
  parseAttendanceKind,
} from './attendance-kind.type'

describe('attendance kinds', () => {
  it('recognises the four kinds and nothing else', () => {
    expect(['none', 'midweek', 'weekend', 'separate'].every(isAttendanceKind)).toBe(true)
    expect(isAttendanceKind('monthly')).toBe(false)
  })

  it('reads an unknown value as not counted', () => {
    expect(parseAttendanceKind('monthly')).toBe(AttendanceKind.None)
    expect(parseAttendanceKind('weekend')).toBe(AttendanceKind.Weekend)
  })

  it('puts only the midweek and weekend meetings in the averages', () => {
    expect(countsInAverages(AttendanceKind.Midweek)).toBe(true)
    expect(countsInAverages(AttendanceKind.Weekend)).toBe(true)
    expect(countsInAverages(AttendanceKind.Separate)).toBe(false)
    expect(countsInAverages(AttendanceKind.None)).toBe(false)
  })

  // The rule the 20261116120000 migration applies; importing an archive from before 2.15 must agree with it.
  it('defaults the seeded meetings by their key and everything else to not counted', () => {
    expect(defaultAttendanceKind('midweek-meeting')).toBe(AttendanceKind.Midweek)
    expect(defaultAttendanceKind('weekend-meeting')).toBe(AttendanceKind.Weekend)
    expect(defaultAttendanceKind('memorial')).toBe(AttendanceKind.Separate)
    expect(defaultAttendanceKind('field-service')).toBe(AttendanceKind.None)
    expect(defaultAttendanceKind('day-off')).toBe(AttendanceKind.None)
  })
})
