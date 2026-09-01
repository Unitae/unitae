import { isTemplateResponsible } from '~/features/events/server/event-templates.server'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

const logger = createLogger('events-auth')

/**
 * Whether the caller may act on this event.
 *
 * `required` is the capability the calling route needs — assigning a part and publishing
 * a programme are different jobs, so those routes ask for their own permission rather
 * than the blanket manage one. It defaults to `CanManagePrograms` for routes that really
 * do mean "edit this event".
 *
 * The template-responsible path is checked regardless of which capability was asked for:
 * delegating a template to someone must keep working without granting them a
 * congregation-wide permission.
 */
export async function canEditEvent(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
  required: Permission = Permission.CanManagePrograms,
): Promise<boolean> {
  if (can(required)) return true
  if (templateId == null) return false
  const responsible = await isTemplateResponsible(db, templateId, userId, congregationId)
  return responsible != null
}

/**
 * The templates the caller is responsible for, via the roles they hold.
 *
 * The empty guard is deliberate: `roleId: { in: [] }` matches nothing today, but relying on
 * that would make "user holds no roles" correct by accident rather than by intent.
 */
export async function getResponsibleTemplateIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return []

  const rows = await db.templateResponsible.findMany({
    where: { roleId: { in: roleIds }, congregationId },
    select: { templateId: true },
  })
  return rows.map(r => r.templateId)
}

export async function canManageAnyProgram(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.CanManagePrograms)) return true
  const ids = await getResponsibleTemplateIds(db, userId, congregationId)
  return ids.length > 0
}

// Narrows a bulk-selection of event ids to the ones the caller is authorised
// to mutate. ProgramManager sees every event in the congregation;
// non-managers see only events whose template they are the responsible for
// (freeform events, templateId null, are always manager-only). Shared by
// every bulk route (release, unrelease, delete) so the auth surface stays
// consistent.
//
// The signature takes a `can:` predicate (matching canEditEvent /
// canManageAnyProgram) rather than a boolean, so the auth surface reads
// consistently across the file. Even the manager path scopes the id list to
// the congregation — a cross-tenant id must not slip through into the
// downstream "not found" bucket.
export async function filterToManageableEventIds(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  eventIds: number[],
  userId: number,
  congregationId: number,
  required: Permission = Permission.CanManagePrograms,
): Promise<number[]> {
  // Empty input short-circuits — no DB roundtrip, no reliance on Prisma's
  // empty-`in: []` semantics.
  if (eventIds.length === 0) return []

  const holdsRequiredCapability = can(required)
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: { id: true, templateId: true },
  })
  // Cross-tenant / stale ids: submitted but not present in this congregation.
  const droppedCrossTenant = eventIds.length - events.length

  if (holdsRequiredCapability) {
    if (droppedCrossTenant > 0) {
      // Distinct from "not found" further down the pipeline: at THIS point we
      // know the id was submitted by a manager for another congregation (or a
      // race deleted it), so support can spot cross-tenant probe attempts.
      logger.warn('filterToManageableEventIds: dropped cross-tenant ids on manager path', {
        userId,
        congregationId,
        submitted: eventIds.length,
        droppedCrossTenant,
      })
    }
    return events.map(e => e.id)
  }

  const responsibleTemplateIds = await getResponsibleTemplateIds(db, userId, congregationId)
  const responsibleSet = new Set(responsibleTemplateIds)
  const allowed = events.filter(e => e.templateId != null && responsibleSet.has(e.templateId)).map(e => e.id)

  // For non-managers, distinguish three drop reasons so support can tell
  // "cross-tenant/stale id" apart from "freeform event manager-only" apart
  // from "you are not the responsible for this template".
  const droppedFreeform = events.filter(e => e.templateId == null).length
  const droppedUnauthorized = events.filter(e => e.templateId != null && !responsibleSet.has(e.templateId)).length
  if (droppedCrossTenant > 0 || droppedFreeform > 0 || droppedUnauthorized > 0) {
    logger.info('filterToManageableEventIds: dropped ids on non-manager path', {
      userId,
      congregationId,
      submitted: eventIds.length,
      allowed: allowed.length,
      droppedCrossTenant,
      droppedFreeform,
      droppedUnauthorized,
    })
  }
  return allowed
}
