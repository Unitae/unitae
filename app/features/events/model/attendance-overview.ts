import { isEntryOpen } from '~/features/events/model/attendance-access'
import { type AttendanceKind, countsInAverages } from '~/features/events/model/attendance-kind.type'
import {
  type AttendanceMeeting,
  averageOf,
  emptyWeeks,
  isComplete,
  monthlyStats,
  onlineShare,
  periodStats,
  serviceYearToDate,
} from '~/features/events/model/attendance-stats'

/** A counted meeting as the attendance page reads it. */
export interface OverviewMeeting extends AttendanceMeeting {
  eventId: number
  name: string
  startDate: Date | string
}

export type AveragedKind = 'midweek' | 'weekend'
export type Measure = 'total' | 'inPerson' | 'online'
export type AttendanceView = 'all' | 'todo' | 'apart'
/** Entered (both counts), to complete (its entry closed with a count missing), or under way. */
export type MeetingState = 'entered' | 'todo' | 'live'

/** The earliest service year the attendance page opens. */
export const FIRST_SERVICE_YEAR = 2000
const FOUR_DIGITS = /^\d{4}$/

/**
 * The service year an address asks for: none asked is the current one; a year still to come, before the first, or not
 * four digits is no year at all (null) — the page sends such an address back rather than show another year under it.
 */
export function serviceYearFrom(asked: string | null, current: number): number | null {
  if (asked == null) return current
  if (!FOUR_DIGITS.test(asked)) return null
  const year = Number(asked)
  return year >= FIRST_SERVICE_YEAR && year <= current ? year : null
}

/** Held: started. Future meetings (the recurring-events job creates them weeks ahead) are not, and appear in no figure,
 * row or gap. */
const held = (meetings: OverviewMeeting[], now: Date) =>
  meetings.filter(meeting => new Date(meeting.startDate).getTime() <= now.getTime())

/**
 * The figures at the top of the page: each kind's average against the same months of the year before, the online
 * share, and the meetings entered and still to complete. `today` is the congregation's local day (which months
 * count), `now` the instant (which meetings are held).
 */
export function attendanceMetrics(input: {
  meetings: OverviewMeeting[]
  previous: OverviewMeeting[]
  serviceYear: number
  today: string
  now: Date
  timeZone: string
}) {
  const { serviceYear, today } = input
  const meetings = held(input.meetings, input.now)
  const current = serviceYearToDate(meetings, serviceYear, today)
  const before = serviceYearToDate(held(input.previous, input.now), serviceYear - 1, today, serviceYear)
  const averaged = meetings.filter(meeting => countsInAverages(meeting.kind))
  const complete = averaged.filter(isComplete).length
  // The change from last year is computed on the exact averages; only what is shown is rounded.
  const kindFigures = (kind: AveragedKind) => {
    const now = periodStats(current, kind)
    const then = periodStats(before, kind)
    return {
      average: now.average,
      previous: then.average,
      // None when last year has nothing to compare with — no meeting, or only meetings entered as zero.
      change:
        now.count > 0 && then.count > 0 && then.total > 0
          ? now.total / now.count / (then.total / then.count) - 1
          : null,
    }
  }
  return {
    midweek: kindFigures('midweek'),
    weekend: kindFigures('weekend'),
    onlineShare: { current: onlineShare(current), previous: onlineShare(before) },
    entered: {
      complete,
      held: averaged.length,
      toComplete: countToComplete(input.meetings, input.now, input.timeZone),
    },
  }
}

const averageFor = (stats: ReturnType<typeof periodStats>, measure: Measure) =>
  measure === 'total' ? stats.average : averageOf(stats[measure], stats.count)

/** Month by month, September to August: the average of one kind and measure, the year shown over the one before. */
export function attendanceChart(input: {
  meetings: OverviewMeeting[]
  previous: OverviewMeeting[]
  serviceYear: number
  kind: AveragedKind
  measure: Measure
  now: Date
}) {
  const current = monthlyStats(held(input.meetings, input.now), input.serviceYear)
  const before = monthlyStats(held(input.previous, input.now), input.serviceYear - 1)
  return current.map((month, index) => {
    const stats = month[input.kind]
    const previousStats = before[index]?.[input.kind]
    return {
      month: month.month,
      current: averageFor(stats, input.measure),
      previous: previousStats ? averageFor(previousStats, input.measure) : null,
      count: stats.count,
    }
  })
}

/** A meeting with a count missing is under way while its entry is open (until local midnight), then to complete. */
function stateOf(meeting: OverviewMeeting, now: Date, timeZone: string): MeetingState {
  if (isComplete(meeting)) return 'entered'
  return isEntryOpen(new Date(meeting.startDate), timeZone, now) ? 'live' : 'todo'
}

/** A meeting the averages wait for: held, its entry closed with a count missing — never one under way, nor one
 * counted apart. The one rule behind the « à compléter » figure and view. */
function awaitsCompletion(meeting: OverviewMeeting, now: Date, timeZone: string): boolean {
  return countsInAverages(meeting.kind) && stateOf(meeting, now, timeZone) === 'todo'
}

/** How many meetings held are « à compléter ». */
export function countToComplete(meetings: OverviewMeeting[], now: Date, timeZone: string): number {
  return held(meetings, now).filter(meeting => awaitsCompletion(meeting, now, timeZone)).length
}

export type MonthRow =
  | ({ type: 'meeting'; state: MeetingState } & OverviewMeeting)
  | { type: 'off'; monday: string; kind: AveragedKind }

export interface AttendanceMonth {
  /** `YYYY-MM`: which month is unfolded. */
  key: string
  year: number
  /** 0 = January. */
  month: number
  rows: MonthRow[]
  midweek: number | null
  weekend: number | null
  /** Complete meetings in the month. */
  entered: number
}

const monthKey = (day: string) => day.slice(0, 7)

/**
 * The months held, the most recent first, each with its meetings newest first. « Toutes » lists the meetings in the
 * averages and the weeks without one inside each kind's run (never the Memorial); « À compléter » only those to
 * complete; « Comptées à part » only those counted apart. A month's averages and entered count are the whole month's,
 * whatever the view.
 */
export function attendanceMonths(input: {
  meetings: OverviewMeeting[]
  now: Date
  timeZone: string
  view: AttendanceView
}): AttendanceMonth[] {
  const meetings = held(input.meetings, input.now)
  const rows: (MonthRow & { sortDay: string })[] = meetings.map(meeting => ({
    type: 'meeting',
    state: stateOf(meeting, input.now, input.timeZone),
    ...meeting,
    sortDay: meeting.day,
  }))
  if (input.view === 'all') {
    for (const kind of ['midweek', 'weekend'] as const) {
      const days = meetings.filter(meeting => meeting.kind === kind).map(meeting => meeting.day)
      for (const monday of emptyWeeks(days)) rows.push({ type: 'off', monday, kind, sortDay: monday })
    }
  }
  const kept = rows.filter(row => {
    if (input.view === 'todo') return row.type === 'meeting' && awaitsCompletion(row, input.now, input.timeZone)
    if (input.view === 'apart') return row.type === 'meeting' && row.kind === 'separate'
    return row.type === 'off' || countsInAverages(row.kind)
  })

  const byMonth = new Map<string, (MonthRow & { sortDay: string })[]>()
  for (const row of kept) byMonth.set(monthKey(row.sortDay), [...(byMonth.get(monthKey(row.sortDay)) ?? []), row])
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthRows]) => {
      const inMonth = meetings.filter(meeting => monthKey(meeting.day) === key)
      return {
        key,
        year: Number(key.slice(0, 4)),
        month: Number(key.slice(5, 7)) - 1,
        rows: monthRows
          .sort((a, b) => b.sortDay.localeCompare(a.sortDay) || (a.type === 'off' ? 1 : -1))
          .map(({ sortDay: _, ...row }) => row as MonthRow),
        midweek: periodStats(inMonth, 'midweek').average,
        weekend: periodStats(inMonth, 'weekend').average,
        entered: inMonth.filter(meeting => countsInAverages(meeting.kind) && isComplete(meeting)).length,
      }
    })
}
