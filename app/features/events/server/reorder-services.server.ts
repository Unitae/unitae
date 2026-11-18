import type { TransactionClient } from '~/shared/infra/db.server'

// Dragging services: an event's (that meeting only) and a template's (the order its new programmes start with).

/**
 * Puts an event's services in the given order. Writes nothing and answers false unless `orderedIds` is exactly this
 * event's services, each once: the caller was authorised on this event, not on whichever one a posted id belongs to,
 * and a service left out would end up tied with the moved ones. Stricter than parts, which accept a subset.
 */
export async function reorderServiceAssignments(
  db: TransactionClient,
  congregationId: number,
  eventId: number,
  orderedIds: number[],
): Promise<boolean> {
  // Two reorders of the congregation's event services at once would interleave their writes.
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_004, congregationId)
  const services = await db.eventServicePart.findMany({ where: { eventId, congregationId }, select: { id: true } })
  if (!isTheWholeList(orderedIds, services)) return false

  for (const [index, id] of orderedIds.entries()) {
    await db.eventServicePart.update({
      where: { id_congregationId: { id, congregationId } },
      data: { order: index * 5 },
    })
  }
  return true
}

/** Puts a template's services in the given order, by the same rule as an event's. */
export async function reorderTemplateServices(
  db: TransactionClient,
  congregationId: number,
  templateId: number,
  orderedIds: number[],
): Promise<boolean> {
  // Two reorders of the congregation's template services at once would interleave their writes.
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_006, congregationId)
  const services = await db.templateServicePart.findMany({
    where: { templateId, congregationId },
    select: { id: true },
  })
  if (!isTheWholeList(orderedIds, services)) return false

  for (const [index, id] of orderedIds.entries()) {
    await db.templateServicePart.update({
      where: { id_congregationId: { id, congregationId } },
      data: { order: index * 5 },
    })
  }
  return true
}

/** Every service once, and nothing else. */
function isTheWholeList(orderedIds: number[], services: { id: number }[]): boolean {
  const ids = new Set(services.map(service => service.id))
  return (
    orderedIds.length === ids.size &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every(id => ids.has(id))
  )
}
