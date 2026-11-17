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
export function attendanceLineItems(meetings: AttendanceLineMeeting[], locale: string): string {
  // The day is already local: read at noon UTC, formatted in UTC, it never shifts.
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return meetings
    .map(meeting => `${day.format(new Date(`${meeting.day}T12:00:00Z`))} ${meeting.total ?? '—'}`)
    .join(' · ')
}
