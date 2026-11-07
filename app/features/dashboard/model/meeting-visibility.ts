interface MeetingLike {
  eventParts: { id: number; hasConflict: boolean }[]
  eventServiceParts: { id: number }[]
  userPartIds: number[]
  userServicePartIds: number[]
}

/**
 * How much of the next meeting a viewer receives, decided on the server so nothing they may not
 * read travels in the page:
 * - `schedule`: they can read the programme (in the programmes or on the board), so they get every
 *   part; otherwise only the parts they hold, which is all the urgent list needs;
 * - `conflicts`: they may act on this meeting, so they also get the absence flags. The board never
 *   shows who is away; nobody else needs to know.
 */
export function meetingForViewer<M extends MeetingLike>(
  meeting: M,
  { schedule, conflicts }: { schedule: boolean; conflicts: boolean },
): M {
  const parts = schedule ? meeting.eventParts : meeting.eventParts.filter(p => meeting.userPartIds.includes(p.id))
  const serviceParts = schedule
    ? meeting.eventServiceParts
    : meeting.eventServiceParts.filter(r => meeting.userServicePartIds.includes(r.id))
  return {
    ...meeting,
    eventParts: conflicts ? parts : parts.map(p => ({ ...p, hasConflict: false })),
    eventServiceParts: serviceParts,
  }
}
