import { serviceYearMonths, toServiceYear } from '~/features/publishers'
import { addDays, mondayOf } from '~/shared/utils/calendar-day'
import { type AttendanceKind, countsInAverages } from './attendance-kind.type'

/** One meeting as the figures see it: its local day and its two counts. */
export interface AttendanceMeeting {
  /** The meeting's local start day, `YYYY-MM-DD` (congregation time zone). */
  day: string
  kind: AttendanceKind
  inPerson: number | null
  online: number | null
}

export interface PeriodStats {
  /** Complete meetings counted. */
  count: number
  inPerson: number
  online: number
  total: number
  /** Whole number, half up; null without a meeting. */
  average: number | null
}

export interface MonthStats {
  /** 0 = January. */
  month: number
  year: number
  midweek: PeriodStats
  weekend: PeriodStats
}

type CompleteMeeting = AttendanceMeeting & { inPerson: number; online: number }

/** Both counts are entered. Until then a meeting stays out of every figure. */
export function isComplete(meeting: AttendanceMeeting): meeting is CompleteMeeting {
  return meeting.inPerson != null && meeting.online != null
}

/** The average the branch report expects: a whole number, rounded half up. */
export function averageOf(total: number, count: number): number | null {
  return count === 0 ? null : Math.round(total / count)
}

/** The complete meetings of one kind in `meetings`, summed. A year is its total over its meetings. */
export function periodStats(meetings: AttendanceMeeting[], kind: 'midweek' | 'weekend'): PeriodStats {
  let count = 0
  let inPerson = 0
  let online = 0
  for (const meeting of meetings) {
    if (meeting.kind !== kind || !isComplete(meeting)) continue
    count++
    inPerson += meeting.inPerson
    online += meeting.online
  }
  const total = inPerson + online
  return { count, inPerson, online, total, average: averageOf(total, count) }
}

const monthOf = (day: string) => ({ year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 })

/** The service year, September to August, month by month. */
export function monthlyStats(meetings: AttendanceMeeting[], serviceYear: number): MonthStats[] {
  return serviceYearMonths(serviceYear).map(({ month, year }) => {
    const inMonth = meetings.filter(meeting => {
      const at = monthOf(meeting.day)
      return at.month === month && at.year === year
    })
    return { month, year, midweek: periodStats(inMonth, 'midweek'), weekend: periodStats(inMonth, 'weekend') }
  })
}

/**
 * The meetings of `serviceYear` in the months that `shown` — the service year on screen — has had so far, as of
 * `today`: the same months whatever the year, so the year shown and the one before it compare month for month. A year
 * that is over has had all twelve.
 */
export function serviceYearToDate(
  meetings: AttendanceMeeting[],
  serviceYear: number,
  today: string,
  shown: number = serviceYear,
): AttendanceMeeting[] {
  const now = monthOf(today)
  const currentServiceYear = toServiceYear(now.month, now.year)
  const elapsed =
    shown < currentServiceYear
      ? 11
      : serviceYearMonths(currentServiceYear).findIndex(m => m.month === now.month && m.year === now.year)
  const months = serviceYearMonths(serviceYear).slice(0, elapsed + 1)
  return meetings.filter(meeting => {
    const at = monthOf(meeting.day)
    return months.some(m => m.month === at.month && m.year === at.year)
  })
}

/** The online part of everyone counted in the averages; null without a meeting. */
export function onlineShare(meetings: AttendanceMeeting[]): number | null {
  let online = 0
  let total = 0
  for (const meeting of meetings) {
    if (!countsInAverages(meeting.kind) || !isComplete(meeting)) continue
    online += meeting.online
    total += meeting.inPerson + meeting.online
  }
  return total === 0 ? null : online / total
}

/**
 * The weeks with no meeting inside a run of a recurring template's meetings, as their Mondays: a week passed for a
 * circuit assembly or a convention. Nothing is stored for them — no meeting is no event.
 */
export function emptyWeeks(days: string[]): string[] {
  if (days.length === 0) return []
  const held = new Set(days.map(mondayOf))
  const sorted = [...held].sort()
  const empty: string[] = []
  for (let monday = sorted[0]; monday < sorted[sorted.length - 1]; monday = addDays(monday, 7)) {
    if (!held.has(monday)) empty.push(monday)
  }
  return empty
}
