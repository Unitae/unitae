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
  const parts = await db.eventPart.findMany({
    where: {
      eventId,
      congregationId,
      OR: [{ assigneeId: userId }, { assistantId: userId }],
      ...(excludePartAssignmentId != null && { id: { not: excludePartAssignmentId } }),
    },
    select: { id: true, name: true, section: true },
  })

  const services = await db.eventServicePart.findMany({
    where: {
      eventId,
      congregationId,
      assigneeId: userId,
      ...(excludeServiceAssignmentId != null && { id: { not: excludeServiceAssignmentId } }),
    },
    select: { id: true, name: true },
  })

  return [
    ...parts.map(a => ({ type: 'part' as const, name: a.name, section: a.section })),
    ...services.map(a => ({ type: 'service' as const, name: a.name })),
  ]
}
