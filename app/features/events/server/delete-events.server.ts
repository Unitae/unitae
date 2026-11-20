import { EventStatus } from '~/features/events/model/event-status.type'
import { cancelPendingAssignmentNotices } from '~/features/events/server/notify-assignment.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Deleting programmes. Programmes and attendance are unrelated: an event that has attendance counts is never deleted
// with its programme — it loses its parts and services and stays, until schedules make that split structural.

/**
 * The events among `ids` that have an attendance count. Programmes and attendance are unrelated: deleting a programme
 * must never take a meeting's counts with it, so these events lose their programme and stay.
 *
 * The events are locked first. A count entered at the same moment holds a key-share lock on its event until it
 * commits; without this lock the check could miss it and the delete would then cascade it away.
 */
async function eventsWithCounts(db: TransactionClient, ids: number[], congregationId: number): Promise<Set<number>> {
  await db.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ANY(${ids}) AND "congregationId" = ${congregationId} FOR UPDATE`
  const rows = await db.attendance.findMany({
    where: { eventId: { in: ids }, congregationId, OR: [{ inPerson: { not: null } }, { online: { not: null } }] },
    select: { eventId: true },
  })
  return new Set(rows.map(row => row.eventId))
}

/**
 * Removes the programme of events that must stay: their parts and services go — with the assignment notices still
 * waiting to be sent, as unreleasing does — and the event goes back to a draft, as a meeting without a programme is,
 * so nothing empty shows on the board. The event and its attendance remain.
 */
async function removeProgrammes(db: TransactionClient, ids: number[], congregationId: number, actorId: number) {
  if (ids.length === 0) return
  const where = { eventId: { in: ids }, congregationId }
  await cancelNoticesOf(db, ids, congregationId)
  await db.eventPart.deleteMany({ where })
  await db.eventServicePart.deleteMany({ where })
  await db.event.updateMany({ where: { id: { in: ids }, congregationId }, data: { status: EventStatus.Draft } })
  for (const id of ids) {
    await auditInTransaction(db, {
      action: AuditAction.ProgrammeRemoved,
      congregationId,
      actorId,
      entityType: 'Event',
      entityId: id,
    })
  }
}

/** Cancels the notices still waiting for the parts and services of these events, before they go. */
async function cancelNoticesOf(db: TransactionClient, eventIds: number[], congregationId: number) {
  const where = { eventId: { in: eventIds }, congregationId }
  const [parts, services] = await Promise.all([
    db.eventPart.findMany({ where, select: { id: true } }),
    db.eventServicePart.findMany({ where, select: { id: true } }),
  ])
  await cancelPendingAssignmentNotices(db, congregationId, {
    partIds: parts.map(part => part.id),
    serviceIds: services.map(service => service.id),
  })
}

export async function bulkDeleteEvents(db: TransactionClient, ids: number[], congregationId: number, actorId: number) {
  if (ids.length === 0) return { count: 0, emptied: 0 }

  const kept = await eventsWithCounts(db, ids, congregationId)
  const toDelete = ids.filter(id => !kept.has(id))
  if (toDelete.length > 0) await cancelNoticesOf(db, toDelete, congregationId)
  const result =
    toDelete.length > 0 ? await db.event.deleteMany({ where: { id: { in: toDelete }, congregationId } }) : { count: 0 }

  // auditInTransaction (not audit) so the audit rows roll back with the
  // delete if the surrounding tx aborts. Matches release/unrelease. One row
  // per requested id — even if the deleteMany count differs (some ids may
  // not have existed), we log the intent.
  for (const id of toDelete) {
    await auditInTransaction(db, {
      action: AuditAction.EventDeleted,
      congregationId,
      actorId,
      entityType: 'Event',
      entityId: id,
    })
  }
  await removeProgrammes(db, [...kept], congregationId, actorId)

  return { count: result.count, emptied: kept.size }
}

/** Deletes an event, or — when it has attendance counts — only its programme. `kept` says which happened. */
export async function deleteEvent(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
): Promise<{ kept: boolean }> {
  if ((await eventsWithCounts(db, [id], congregationId)).has(id)) {
    await removeProgrammes(db, [id], congregationId, actorId)
    return { kept: true }
  }
  await cancelNoticesOf(db, [id], congregationId)
  await db.event.delete({ where: { id_congregationId: { id, congregationId } } })
  await auditInTransaction(db, {
    action: AuditAction.EventDeleted,
    congregationId,
    actorId,
    entityType: 'Event',
    entityId: id,
  })
  return { kept: false }
}
