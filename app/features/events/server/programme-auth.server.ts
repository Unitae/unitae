import { isTemplateResponsible } from '~/features/events/server/programme-templates.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

export async function canEditEvent(
  db: TransactionClient,
  can: (role: Permission) => boolean,
  userId: number,
  templateId: number | null,
  congregationId: number,
): Promise<boolean> {
  if (can(Permission.ProgramManager)) return true
  if (templateId == null) return false
  const responsible = await isTemplateResponsible(db, templateId, userId, congregationId)
  return responsible != null
}

export async function getResponsibleTemplateIds(
  db: TransactionClient,
  userId: number,
  congregationId: number,
): Promise<number[]> {
  const rows = await db.programmeTemplateResponsible.findMany({
    where: { userId, congregationId },
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
): Promise<number[]> {
  // Empty input short-circuits — no DB roundtrip, no reliance on Prisma's
  // empty-`in: []` semantics.
  if (eventIds.length === 0) return []

  const isProgramManager = can(Permission.ProgramManager)
  const events = await db.event.findMany({
    where: { id: { in: eventIds }, congregationId },
    select: { id: true, templateId: true },
  })
  if (isProgramManager) return events.map(e => e.id)

  const responsibleTemplateIds = await getResponsibleTemplateIds(db, userId, congregationId)
  const responsibleSet = new Set(responsibleTemplateIds)
  return events.filter(e => e.templateId != null && responsibleSet.has(e.templateId)).map(e => e.id)
}
