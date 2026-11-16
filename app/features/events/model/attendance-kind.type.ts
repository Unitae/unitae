// How a template's events count in attendance. Stored on EventTemplate.attendanceKind and constrained in SQL by
// EventTemplate_attendanceKind_check, so a new kind is a migration, not just a new member here.
//
// - midweek / weekend: the two columns of the S-88 and of the averages reported to the branch;
// - separate: entered and listed, but kept out of the averages and the S-88 (the Mémorial);
// - none: no entry at all.
export const AttendanceKind = {
  None: 'none',
  Midweek: 'midweek',
  Weekend: 'weekend',
  Separate: 'separate',
} as const

export type AttendanceKind = (typeof AttendanceKind)[keyof typeof AttendanceKind]

export const ATTENDANCE_KINDS: readonly AttendanceKind[] = Object.values(AttendanceKind)

export function isAttendanceKind(value: string): value is AttendanceKind {
  return (ATTENDANCE_KINDS as readonly string[]).includes(value)
}

/** A stored value read back into the union; anything unexpected counts as nothing. */
export function parseAttendanceKind(value: string): AttendanceKind {
  return isAttendanceKind(value) ? value : AttendanceKind.None
}

/** The kinds whose meetings feed the averages, the trend and the S-88. */
export function countsInAverages(kind: AttendanceKind): kind is 'midweek' | 'weekend' {
  return kind === AttendanceKind.Midweek || kind === AttendanceKind.Weekend
}
