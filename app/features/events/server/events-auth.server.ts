import { ResponsibleScope } from '~/features/events/model/responsible-scope.type'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

const logger = createLogger('events-auth')

// The edit authority a user holds over a given event, or null for no access:
//   - 'full'    → ProgramManager/Admin, or the template's full responsible.
//   - 'service' → the template's service responsible (services section only).
// Freeform events (templateId null) are manager-only, so non-managers get null.
// If a user somehow holds both scopes on a template, 'full' dominates.
export async function getEventEditScope(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<ResponsibleScope | null> {
  if (can(Permission.ProgramManager)) return ResponsibleScope.Full
  if (templateId == null) return null

  const rows = await db.templateResponsible.findMany({
    where: { templateId, userId, congregationId },
    select: { scope: true },
  })
  if (rows.length === 0) return null
  return rows.some(r => r.scope === ResponsibleScope.Full) ? ResponsibleScope.Full : ResponsibleScope.Service
}

export async function canEditEvent(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<boolean> {
  return (await getEventEditScope(db, can, userId, templateId, congregationId)) != null
}

// Full-authority gate for structural / lifecycle operations (create parts,
// reorder, edit event info, release, unrelease, delete). Service responsibles
// are excluded — their edits are confined to the services section, gated by
// canEditEvent instead.
export async function canManageEvent(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<boolean> {
  return (await getEventEditScope(db, can, userId, templateId, congregationId)) === ResponsibleScope.Full
}

// Template ids the user is a responsible for. `scope` narrows the result:
//   - omitted → every scope (used by the events list, where any responsible
//     should be able to open their template's events);
//   - provided → only that scope (full-only for create / bulk / management).
export async function getResponsibleTemplateIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  scope?: ResponsibleScope,
): Promise<number[]> {
  const rows = await db.templateResponsible.findMany({
    where: { userId, congregationId, ...(scope ? { scope } : {}) },
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
  if (can(Permission.ProgramManager)) return true
  // Creating events is a full-responsibility action; a service responsible
  // (services section only) must not reach the "new event" flow.
  const ids = await getResponsibleTemplateIds(db, userId, congregationId, ResponsibleScope.Full)
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
): Promise<number[]> {
  // Empty input short-circuits — no DB roundtrip, no reliance on Prisma's
  // empty-`in: []` semantics.
  if (eventIds.length === 0) return []

  const isProgramManager = can(Permission.ProgramManager)
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: { id: true, templateId: true },
  })
  // Cross-tenant / stale ids: submitted but not present in this congregation.
  const droppedCrossTenant = eventIds.length - events.length

  if (isProgramManager) {
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

  // Bulk release/unrelease/delete are full-responsibility actions — service
  // responsibles are excluded here (they edit services on a single event view).
  const responsibleTemplateIds = await getResponsibleTemplateIds(db, userId, congregationId, ResponsibleScope.Full)
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
