import { PART_ITEMS, SERVICE_ITEMS } from '~/features/events/server/item-projection.server'
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
}

export async function listUserSameEventAssignments(
  db: TransactionClient,
  { userId, eventId, congregationId, excludePartAssignmentId, excludeServiceAssignmentId }: Options,
): Promise<SameEventAssignment[]> {
  // The excluded assignment by the id its routes carry, the old row's (plan T12).
  const parts = await db.item.findMany({
    where: {
      ...PART_ITEMS,
      eventId,
      congregationId,
      OR: [{ assigneeId: userId }, { assistantId: userId }],
      ...(excludePartAssignmentId != null && { NOT: { legacyPartId: excludePartAssignmentId } }),
    },
    select: { name: true, section: true },
  })

  const services = await db.item.findMany({
    where: {
      ...SERVICE_ITEMS,
      eventId,
      congregationId,
      assigneeId: userId,
      ...(excludeServiceAssignmentId != null && { NOT: { legacyServiceId: excludeServiceAssignmentId } }),
    },
    select: { name: true },
  })

  return [
    ...parts.map(a => ({ type: 'part' as const, name: a.name, section: a.section })),
    ...services.map(a => ({ type: 'service' as const, name: a.name })),
  ]
}
