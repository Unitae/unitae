import { describe, expect, it } from 'vitest'
import { attendanceReport } from './attendance-report'
import type { AttendanceMeeting } from './attendance-stats'

const meeting = (
  day: string,
  kind: AttendanceMeeting['kind'],
  inPerson: number | null,
  online: number | null,
): AttendanceMeeting => ({ day, kind, inPerson, online })

describe('attendanceReport', () => {
  const report = attendanceReport(
    [
      meeting('2026-09-03', 'midweek', 70, 15),
      meeting('2026-09-10', 'midweek', 72, 16),
      meeting('2026-09-06', 'weekend', 100, 12),
      meeting('2026-10-01', 'midweek', 74, null), // incomplete: counts nowhere
      meeting('2026-10-04', 'weekend', 98, 20),
      meeting('2027-04-02', 'separate', 181, 43), // the Memorial: not on the S-88
    ],
    2026,
  )

  // The S-88: per month and kind, the meetings counted, their total and the average per meeting.
  it('gives each month of the service year, September to August, its figures by kind', () => {
    expect(report.months).toHaveLength(12)
    expect(report.months[0]).toEqual({
      month: 8,
      year: 2026,
      midweek: { count: 2, total: 173, average: 87 },
      weekend: { count: 1, total: 112, average: 112 },
    })
    expect(report.months[1]?.midweek).toEqual({ count: 0, total: 0, average: null })
    expect(report.months[11]).toMatchObject({ month: 7, year: 2027 })
  })

  // The year's average is its total over its meetings, never an average of monthly averages.
  it('gives the year its average per meeting, from its total', () => {
    expect(report.year.midweek).toEqual({ count: 2, total: 173, average: 87 })
    expect(report.year.weekend).toEqual({ count: 2, total: 230, average: 115 })
  })
})
