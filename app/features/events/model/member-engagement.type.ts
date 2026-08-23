/** An upcoming programme assignment of a member, for record-page display. */
export interface MemberAssignment {
  /** `part-{id}` or `service-{id}` — unique across the merged list. */
  key: string
  partName: string
  eventId: number
  eventName: string
  eventStartDate: Date
}

/** An upcoming day-off period of a member. */
export interface MemberAbsence {
  id: number
  startDate: Date | null
  endDate: Date | null
}
