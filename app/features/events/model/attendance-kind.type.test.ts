import { describe, expect, it } from 'vitest'
import { AttendanceKind, countsInAverages, isAttendanceKind, parseAttendanceKind } from './attendance-kind.type'

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
})
