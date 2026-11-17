import { dayOf, mondayOf } from '~/shared/utils/calendar-day'

/** A meeting of last week on the programme's attendance line: its local day and its total, null while incomplete. */
export interface AttendanceLineMeeting {
  /** `YYYY-MM-DD`, the congregation's local day. */
  day: string
  total: number | null
}

/**
 * The meetings of the line « Assistance la semaine passée : … », as the board screen and its sheet both word them:
 * « jeudi 12 nov. — · dimanche 15 nov. 119 ». The total only, « — » for a meeting a count is still missing from.
 */
export function attendanceLineItems(
  meetings: AttendanceLineMeeting[],
  locale: string,
  /** One meeting as the language words it: « dimanche 15 nov. 119 », « Sunday, Nov 15: 119 ». */
  item: (day: string, total: string) => string,
): string {
  // The day is already local: read at noon UTC, formatted in UTC, it never shifts.
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return meetings
    .map(meeting => item(day.format(new Date(`${meeting.day}T12:00:00Z`)), String(meeting.total ?? '—')))
    .join(' · ')
}

/**
 * Whether the printed sheet carries the line, as the screen does: it belongs to the week under way, so only a sheet by
 * date holding one of its meetings — never one grouped by template, nor one of weeks to come only.
 */
export function sheetShowsAttendance(sheet: {
  events: { startDate: Date | string }[]
  groupBy: 'date' | 'template'
  asOf: Date
  timeZone: string
}): boolean {
  if (sheet.groupBy !== 'date') return false
  const thisWeek = mondayOf(dayOf(sheet.asOf, sheet.timeZone))
  return sheet.events.some(event => mondayOf(dayOf(new Date(event.startDate), sheet.timeZone)) === thisWeek)
}
