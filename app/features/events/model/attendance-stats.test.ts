import { describe, expect, it } from 'vitest'
import {
  type AttendanceMeeting,
  averageOf,
  emptyWeeks,
  isComplete,
  monthlyStats,
  onlineShare,
  periodStats,
  serviceYearToDate,
} from './attendance-stats'

const meeting = (
  day: string,
  kind: AttendanceMeeting['kind'],
  inPerson: number | null,
  online: number | null,
): AttendanceMeeting => ({ day, kind, inPerson, online })

describe('isComplete', () => {
  it('needs both counts', () => {
    expect(isComplete(meeting('2026-11-05', 'midweek', 70, 18))).toBe(true)
    expect(isComplete(meeting('2026-11-05', 'midweek', 70, null))).toBe(false)
    expect(isComplete(meeting('2026-11-05', 'midweek', null, 18))).toBe(false)
  })

  it('takes zero as a count, not as missing', () => {
    expect(isComplete(meeting('2026-11-05', 'midweek', 0, 0))).toBe(true)
  })
})

describe('averageOf', () => {
  it('rounds half up to a whole number', () => {
    expect(averageOf(175, 2)).toBe(88)
    expect(averageOf(174, 2)).toBe(87)
    expect(averageOf(173, 2)).toBe(87)
  })

  it('has no average without a meeting', () => {
    expect(averageOf(0, 0)).toBeNull()
  })
})

describe('periodStats', () => {
  const meetings = [
    meeting('2026-11-05', 'midweek', 71, 17),
    meeting('2026-11-12', 'midweek', 74, null),
    meeting('2026-11-08', 'weekend', 96, 21),
    meeting('2026-11-01', 'weekend', 94, 19),
    meeting('2026-03-31', 'separate', 181, 43),
  ]

  it('counts only complete meetings of the kind', () => {
    expect(periodStats(meetings, 'midweek')).toEqual({ count: 1, inPerson: 71, online: 17, total: 88, average: 88 })
    expect(periodStats(meetings, 'weekend')).toEqual({ count: 2, inPerson: 190, online: 40, total: 230, average: 115 })
  })

  it('reports an empty period without an average', () => {
    expect(periodStats([], 'weekend')).toEqual({ count: 0, inPerson: 0, online: 0, total: 0, average: null })
  })
})

describe('monthlyStats', () => {
  it('lays out the service year from September to August by local day', () => {
    const months = monthlyStats(
      [
        meeting('2026-09-03', 'midweek', 70, 15),
        meeting('2026-09-10', 'midweek', 72, 17),
        meeting('2026-08-31', 'midweek', 60, 10), // previous service year
        meeting('2027-08-26', 'midweek', 65, 11),
      ],
      2026,
    )
    expect(months).toHaveLength(12)
    expect(months[0]).toMatchObject({ month: 8, year: 2026 })
    expect(months[0].midweek).toEqual({ count: 2, inPerson: 142, online: 32, total: 174, average: 87 })
    expect(months[11]).toMatchObject({ month: 7, year: 2027 })
    expect(months[11].midweek.count).toBe(1)
    expect(months[1].midweek.average).toBeNull()
  })

  it('takes the year total over the meetings, never an average of monthly averages', () => {
    const meetings = [
      meeting('2026-09-03', 'weekend', 100, 0),
      meeting('2026-10-01', 'weekend', 60, 0),
      meeting('2026-10-08', 'weekend', 60, 0),
      meeting('2026-10-15', 'weekend', 60, 0),
    ]
    // Monthly averages 100 and 60 would average to 80; the year is 280 over 4 meetings.
    expect(periodStats(meetings, 'weekend').average).toBe(70)
  })
})

describe('serviceYearToDate', () => {
  const meetings = [
    meeting('2025-09-07', 'weekend', 100, 10),
    meeting('2025-11-09', 'weekend', 102, 10),
    meeting('2025-12-07', 'weekend', 200, 0), // after the compared months
    meeting('2026-09-06', 'weekend', 110, 12),
    meeting('2026-11-08', 'weekend', 96, 21),
  ]

  it('keeps the service year up to the current month', () => {
    const current = serviceYearToDate(meetings, 2026, '2026-11-16')
    expect(current.map(m => m.day)).toEqual(['2026-09-06', '2026-11-08'])
  })

  it('compares with the same months of the previous service year', () => {
    const previous = serviceYearToDate(meetings, 2025, '2026-11-16', 2026)
    expect(previous.map(m => m.day)).toEqual(['2025-09-07', '2025-11-09'])
  })

  // A year that is over is seen whole, and compared with the whole year before it — never with three months.
  it('takes every month of a year that is over, and of the year before it', () => {
    expect(serviceYearToDate(meetings, 2025, '2026-11-16').map(m => m.day)).toEqual([
      '2025-09-07',
      '2025-11-09',
      '2025-12-07',
    ])
    // The year before a year that is over: all twelve months as well.
    const older = [meeting('2024-09-08', 'weekend', 90, 9), meeting('2025-06-01', 'weekend', 91, 9)]
    expect(serviceYearToDate(older, 2024, '2026-11-16', 2025).map(m => m.day)).toEqual(['2024-09-08', '2025-06-01'])
  })
})

describe('onlineShare', () => {
  it('is the online part of everyone counted', () => {
    expect(onlineShare([meeting('2026-11-08', 'weekend', 96, 21), meeting('2026-11-05', 'midweek', 71, 17)])).toBe(
      38 / 205,
    )
  })

  it('ignores incomplete and separate meetings', () => {
    expect(
      onlineShare([
        meeting('2026-11-08', 'weekend', 80, 20),
        meeting('2026-11-12', 'midweek', 74, null),
        meeting('2026-03-31', 'separate', 0, 500),
      ]),
    ).toBe(0.2)
  })

  it('has no share without a meeting', () => {
    expect(onlineShare([])).toBeNull()
  })
})

describe('emptyWeeks', () => {
  it('names the Mondays of the weeks missing from a run of meetings', () => {
    // Sundays 4, 11 and 25 October; the week of the 18th had the circuit assembly.
    expect(emptyWeeks(['2026-10-04', '2026-10-11', '2026-10-25'])).toEqual(['2026-10-12'])
  })

  it('finds nothing before the first or after the last meeting', () => {
    expect(emptyWeeks(['2026-10-11'])).toEqual([])
    expect(emptyWeeks([])).toEqual([])
  })

  it('does not care about order or a moved day within a week', () => {
    // The midweek meeting moved to Tuesday during the visit week.
    expect(emptyWeeks(['2026-12-22', '2026-12-17', '2026-12-31'])).toEqual([])
  })
})
