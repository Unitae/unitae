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

/** Held: started. The meetings the job created ahead are not, and appear in no figure, row or gap. */
const held = (meetings: OverviewMeeting[], now: Date) =>
  meetings.filter(meeting => new Date(meeting.startDate).getTime() <= now.getTime())

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
  // The change from last year is computed on the exact averages; only what is shown is rounded (§6.2).
  const kindFigures = (kind: AveragedKind) => {
    const now = periodStats(current, kind)
    const then = periodStats(before, kind)
    return {
      average: now.average,
      previous: then.average,
      change: now.count > 0 && then.count > 0 ? now.total / now.count / (then.total / then.count) - 1 : null,
    }
  }
  return {
    midweek: kindFigures('midweek'),
    weekend: kindFigures('weekend'),
    onlineShare: { current: onlineShare(current), previous: onlineShare(before) },
    entered: {
      complete,
      held: averaged.length,
      // A meeting under way is not late yet.
      toComplete: averaged.filter(meeting => stateOf(meeting, input.now, input.timeZone) === 'todo').length,
    },
  }
}

const averageFor = (stats: ReturnType<typeof periodStats>, measure: Measure) =>
  measure === 'total' ? stats.average : averageOf(stats[measure], stats.count)

/** Month by month, September to August: the average of one kind and measure, this year over the year before. */
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

export type MonthRow =
  | ({ type: 'meeting'; state: MeetingState } & OverviewMeeting)
  | { type: 'off'; monday: string; kind: AveragedKind }

export interface AttendanceMonth {
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
 * The months held, the most recent first, each with its meetings newest first and its averages. A week without a
 * meeting inside the run of a kind reads « Pas de réunion »; a view keeps only the meetings to complete, or only those
 * counted apart (the Memorial).
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
    // The meetings the averages wait for, as the « à compléter » figure counts them: never one counted apart.
    if (input.view === 'todo') return row.type === 'meeting' && row.state === 'todo' && countsInAverages(row.kind)
    if (input.view === 'apart') return row.type === 'meeting' && row.kind === 'separate'
    return row.type === 'off' || countsInAverages(row.kind as AttendanceKind)
  })

  const byMonth = new Map<string, (MonthRow & { sortDay: string })[]>()
  for (const row of kept) byMonth.set(monthKey(row.sortDay), [...(byMonth.get(monthKey(row.sortDay)) ?? []), row])
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, monthRows]) => {
      const inMonth = meetings.filter(meeting => monthKey(meeting.day) === key)
      return {
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
