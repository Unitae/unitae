import { roomBeingAssigned } from '~/features/events/model/part-rooms'
import { PART_ITEMS, SERVICE_ITEMS } from '~/features/events/server/item-projection.server'
import { PART_HELD_BY } from '~/features/events/server/item-rooms.queries'
import type { TransactionClient } from '~/shared/infra/db.server'

export type SameEventAssignment = { type: 'part'; name: string; section: string } | { type: 'service'; name: string }

type Options = {
  userId: number
  eventId: number
  congregationId: number
  // When set, the query drops the assignment currently being edited so it does
  // not show up as "another assignment" for the same person on the same event.
  excludePartAssignmentId?: number | null
  excludeServiceAssignmentId?: number | null
  /** The room of the part being edited (parallel rooms); none, its only or main room. */
  roomId?: number | null
}

export async function listUserSameEventAssignments(
  db: TransactionClient,
  { userId, eventId, congregationId, excludePartAssignmentId, excludeServiceAssignmentId, roomId }: Options,
): Promise<SameEventAssignment[]> {
  const parts = await db.item.findMany({
    where: {
      ...PART_ITEMS,
      eventId,
      congregationId,
      ...PART_HELD_BY(userId),
    },
    select: {
      id: true,
      name: true,
      section: true,
      rooms: { select: { roomId: true, assigneeId: true, assistantId: true, room: { select: { key: true } } } },
    },
  })
  // The part being edited is left out only for the room being edited: the person in another of its rooms holds
  // another assignment (parallel rooms).
  const holds = (row: { assigneeId: number | null; assistantId: number | null }) =>
    row.assigneeId === userId || row.assistantId === userId
  const others = parts.filter(part => {
    if (part.id !== excludePartAssignmentId) return true
    // A part read before rooms (no row) is left out whole, as before.
    const rows = part.rooms ?? []
    const edited = roomBeingAssigned(rows, roomId)
    return rows.some(row => row !== edited && holds(row))
  })

  const services = await db.item.findMany({
    where: {
      ...SERVICE_ITEMS,
      eventId,
      congregationId,
      assigneeId: userId,
      ...(excludeServiceAssignmentId != null && { NOT: { id: excludeServiceAssignmentId } }),
    },
    select: { name: true },
  })

  return [
    ...others.map(a => ({ type: 'part' as const, name: a.name, section: a.section })),
    ...services.map(a => ({ type: 'service' as const, name: a.name })),
  ]
}
