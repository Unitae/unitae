import type { MemberAbsence, MemberAssignment } from '~/features/events'

export interface RecordAssignment extends MemberAssignment {
  /** A service slot (sound, microphones…) rather than a programme part. */
  service: boolean
  /** It falls inside one of the person's planned absences. */
  absent: boolean
}

/**
 * The record's upcoming assignments, each flagged when it falls inside a planned absence, as on the home page. Without
 * the absences (`null`: the reader may not see them), nothing is flagged, so an absence never shows through.
 */
export function withAbsences(assignments: MemberAssignment[], absences: MemberAbsence[] | null): RecordAssignment[] {
  const periods = (absences ?? []).flatMap(({ startDate, endDate }) =>
    startDate != null && endDate != null ? [{ start: startDate.getTime(), end: endDate.getTime() }] : [],
  )
  return assignments.map(assignment => {
    const time = assignment.eventStartDate.getTime()
    return {
      ...assignment,
      service: assignment.key.startsWith('service-'),
      absent: periods.some(period => period.start <= time && time <= period.end),
    }
  })
}
