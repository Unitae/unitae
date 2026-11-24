import { SYSTEM_TEMPLATE_KEYS } from '~/features/events/model/event-template.type'
import {
  type ItemKind,
  itemIdFromRequest,
  PART_ITEMS,
  SERVICE_ITEMS,
} from '~/features/events/server/item-projection.server'
import { canFillSchedule, responsibleKindIds } from '~/features/events/server/schedule-rights.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

const logger = createLogger('events-auth')

/**
 * The kinds the caller may move an event to: all of them for a programme manager, otherwise the kinds suggesting a
 * schedule template they answer for, the duties' included (D28, D49). Offering any other would let a responsible hand
 * their event to kinds they cannot change; « Changer le type » offers these (kindChangeOptions), never a system one.
 */
export async function listApplicableTemplates(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  congregationId: number,
): Promise<{ id: number; name: string }[]> {
  // Never a system template: the freeform one has no parts to bring.
  const notSystem = { key: { notIn: [...SYSTEM_TEMPLATE_KEYS] } }
  let where: { congregationId: number; key: typeof notSystem.key; id?: { in: number[] } } = {
    congregationId,
    ...notSystem,
  }
  if (!can(Permission.CanManagePrograms)) {
    // The kinds suggesting a schedule template they answer for (D49).
    const ids = await responsibleKindIds(db, userId, congregationId)
    if (ids.length === 0) return []
    where = { ...where, id: { in: ids } }
  }
  return db.eventTemplate.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}

/**
 * Whether an assignment row actually belongs to the event the caller was authorised on.
 *
 * The route's rule (canFillSchedule, canChangeEvent…) answers "may you act on THIS event", keyed off the event id in
 * the URL, while the writers look their item up by (id, congregationId) and kind, never by event. Nothing pairs the
 * two, so without this check a caller authorised on one event can post an assignment id belonging to another event in
 * the same congregation and the write goes through — which defeats per-schedule responsibility.
 *
 * Checked in the routes rather than inside the writers: the event id is a property of the
 * request, not of the assignment, and threading it through four writers with ~30 call sites
 * each would say the same thing far less clearly.
 */
export async function assignmentBelongsToEvent(
  db: TransactionClient,
  kind: ItemKind,
  assignmentId: number,
  eventId: number,
  congregationId: number,
): Promise<boolean> {
  // A malformed `id` query param arrives as NaN; Prisma would reject it as an
  // Int at the driver, so it is refused here as the bad request it is.
  if (!Number.isInteger(assignmentId)) return false

  // The item of the kind asked: a duty's id asked as a part is not one.
  const row = await db.item.findFirst({
    where: { id: assignmentId, eventId, congregationId, ...(kind === 'service' ? SERVICE_ITEMS : PART_ITEMS) },
    select: { id: true },
  })

  if (row == null) {
    logger.warn('assignmentBelongsToEvent: assignment does not belong to the authorised event', {
      kind,
      assignmentId,
      eventId,
      congregationId,
    })
  }
  return row != null
}

/**
 * The item a request names, when it is an item of that kind on the event the caller was authorised on; null otherwise
 * (plan T12, 5i-b). Reading the id and checking it are one call, so no route can take the first without the second:
 * an id under the new name is the item's, unchecked until here; one under the old name is the old row's, translated.
 */
export async function resolveEventItem(
  db: TransactionClient,
  posted: { itemId: string | null; legacyId: string | null },
  kind: ItemKind,
  eventId: number,
  congregationId: number,
): Promise<number | null> {
  const id = await itemIdFromRequest(db, posted, kind, congregationId)
  if (id == null) return null
  return (await assignmentBelongsToEvent(db, kind, id, eventId, congregationId)) ? id : null
}

/**
 * Whether a template's part or service really belongs to the template the caller was authorised on — the template
 * editor's counterpart of assignmentBelongsToEvent. A template's responsible may edit it, while the writers find a
 * part or a service by (id, congregationId) alone.
 */
export async function templateItemBelongsToTemplate(
  db: TransactionClient,
  kind: 'part' | 'service',
  id: number,
  templateId: number,
  congregationId: number,
): Promise<boolean> {
  if (!Number.isInteger(id)) return false

  const where = { id, templateId, congregationId }
  const row =
    kind === 'service'
      ? await db.templateServicePart.findFirst({ where, select: { id: true } })
      : await db.templatePart.findFirst({ where, select: { id: true } })

  if (row == null) {
    logger.warn('templateItemBelongsToTemplate: item does not belong to the authorised template', {
      kind,
      id,
      templateId,
      congregationId,
    })
  }
  return row != null
}

/**
 * Whether the caller may read the facts shown while assigning a slot — absences, rotation, other duties at the
 * event. They serve whoever may fill that slot's schedule, so this follows the fill routes (canFillSchedule), and a
 * posted slot must belong to the event.
 */
export async function mayReadSlotFacts(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  event: { id: number; templateId: number | null },
  congregationId: number,
  slot: { kind: 'part' | 'service'; assignmentId: number | null },
): Promise<boolean> {
  if (!(await canFillSchedule(db, can, userId, event, slot.kind, congregationId))) return false
  if (slot.assignmentId == null) return true
  return assignmentBelongsToEvent(db, slot.kind, slot.assignmentId, event.id, congregationId)
}

export async function canManageAnyProgram(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  // A responsible of a schedule template some kind suggests (D28).
  return (await responsibleKindIds(db, userId, congregationId)).length > 0
}
