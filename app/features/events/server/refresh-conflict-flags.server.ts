import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Recomputes the `hasConflict` flag on every assignment row that `memberId` participates in,
 * for programme events overlapping [startDate, endDate].
 *
 * Split out of `event-part-assignments.server.ts`: that module owns the assign/unassign
 * commands, while this one owns the bulk reconciliation triggered whenever a member's
 * absences change. Keeping them apart also keeps both inside the service-file size budget.
 */
export async function refreshConflictFlags(
  db: TransactionClient,
  memberId: number,
  startDate: Date,
  endDate: Date,
  congregationId: number,
) {
  // Every event overlapping the range, with or without a template: a filter through `template` would inner-join it and
  // drop the events that have none.
  const overlappingEvents = await db.event.findMany({
    where: {
      congregationId,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { id: true, startDate: true, endDate: true },
  })

  if (overlappingEvents.length === 0) return

  const eventIds = overlappingEvents.map(event => event.id)

  // Fetch every affected row up front rather than per event. The previous shape issued
  // one parts query, one services query and two absence lookups PER EVENT PER ROW, so a
  // single absence edit could fan out into dozens of round trips.
  const parts = await db.eventPart.findMany({
    where: {
      eventId: { in: eventIds },
      congregationId,
      OR: [{ assigneeId: memberId }, { assistantId: memberId }],
    },
    select: { id: true, eventId: true, assigneeId: true, assistantId: true },
  })

  // Service-role rows have a single assignee, so no co-participant to consider.
  const services = await db.eventServicePart.findMany({
    where: { eventId: { in: eventIds }, assigneeId: memberId, congregationId },
    select: { id: true, eventId: true, assigneeId: true },
  })

  if (parts.length === 0 && services.length === 0) return

  // hasConflict is one flag per assignment row, but a part can have two participants
  // (speaker + reader). Computing the flag from ONLY the refreshed member's state would
  // silently clear a conflict the co-participant still owns — e.g. Alice removes her
  // absence but Bob is still absent on the same part. So absences are needed for every
  // participant on the matched rows, not just `memberId`.
  const participantIds = new Set<number>()
  for (const part of parts) {
    if (part.assigneeId != null) participantIds.add(part.assigneeId)
    if (part.assistantId != null) participantIds.add(part.assistantId)
  }
  for (const service of services) {
    if (service.assigneeId != null) participantIds.add(service.assigneeId)
  }

  // One absence query covering the widest span of the matched events. It is a superset of
  // what any single event needs; `overlaps` below still applies the exact per-event range,
  // so the result is identical to the old per-(participant, event) query.
  const windowStart = overlappingEvents.reduce((min, e) => (e.startDate < min ? e.startDate : min), startDate)
  const windowEnd = overlappingEvents.reduce((max, e) => (e.endDate > max ? e.endDate : max), endDate)

  const absences =
    participantIds.size === 0
      ? []
      : await db.absence.findMany({
          where: {
            congregationId,
            memberId: { in: [...participantIds] },
            startDate: { lte: windowEnd },
            endDate: { gte: windowStart },
          },
          select: { startDate: true, endDate: true, memberId: true },
        })

  const absencesByMember = new Map<number, { start: number; end: number }[]>()
  for (const absence of absences) {
    const absentMemberId = absence.memberId
    if (absentMemberId == null) continue
    const ranges = absencesByMember.get(absentMemberId) ?? []
    ranges.push({ start: absence.startDate.getTime(), end: absence.endDate.getTime() })
    absencesByMember.set(absentMemberId, ranges)
  }

  const eventById = new Map(overlappingEvents.map(event => [event.id, event]))

  // Mirrors checkDayOffConflict's SQL predicate exactly:
  // absence.startDate <= event.endDate AND absence.endDate >= event.startDate.
  function isAbsent(participantId: number | null, eventId: number): boolean {
    if (participantId == null) return false
    const ranges = absencesByMember.get(participantId)
    if (ranges == null) return false
    const event = eventById.get(eventId)
    if (event == null) return false
    const eventStart = event.startDate.getTime()
    const eventEnd = event.endDate.getTime()
    return ranges.some(range => range.start <= eventEnd && range.end >= eventStart)
  }

  const partsInConflict: number[] = []
  const partsClear: number[] = []
  for (const part of parts) {
    const conflict = isAbsent(part.assigneeId, part.eventId) || isAbsent(part.assistantId, part.eventId)
    ;(conflict ? partsInConflict : partsClear).push(part.id)
  }

  const servicesInConflict: number[] = []
  const servicesClear: number[] = []
  for (const service of services) {
    ;(isAbsent(service.assigneeId, service.eventId) ? servicesInConflict : servicesClear).push(service.id)
  }

  // Two writes per table at most, instead of one per row.
  if (partsInConflict.length > 0) {
    await db.eventPart.updateMany({
      where: { id: { in: partsInConflict }, congregationId },
      data: { hasConflict: true },
    })
  }
  if (partsClear.length > 0) {
    await db.eventPart.updateMany({ where: { id: { in: partsClear }, congregationId }, data: { hasConflict: false } })
  }
  if (servicesInConflict.length > 0) {
    await db.eventServicePart.updateMany({
      where: { id: { in: servicesInConflict }, congregationId },
      data: { hasConflict: true },
    })
  }
  if (servicesClear.length > 0) {
    await db.eventServicePart.updateMany({
      where: { id: { in: servicesClear }, congregationId },
      data: { hasConflict: false },
    })
  }
}
