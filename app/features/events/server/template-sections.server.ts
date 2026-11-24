import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// A template's sections and halls exist by its parts: each part carries its section's name and, in parallel halls,
// its hall's (`track`). These write them across the parts that carry them.

/** Renames a section on every part of the template in it; how many parts it renamed (none to an empty name). */
export async function renameTemplateSection(
  db: TransactionClient,
  templateId: number,
  from: string,
  to: string,
  congregationId: number,
  actorId: number,
) {
  const name = sanitizeText(to).trim()
  if (name === '' || name === from) return 0
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section: from },
    data: { section: name },
  })
  if (count === 0) return 0
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await auditInTransaction(db, {
    action: AuditAction.TemplateUpdated,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: { section: { from, to: name } },
  })
  return count
}

/** Renames a hall within its section, on every part in it; how many parts it renamed. */
export async function renameTemplateHall(
  db: TransactionClient,
  templateId: number,
  section: string,
  from: string,
  to: string,
  congregationId: number,
  actorId: number,
) {
  const name = sanitizeText(to).trim()
  if (name === '' || name === from) return 0
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section, track: from },
    data: { track: name },
  })
  if (count === 0) return 0
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await auditInTransaction(db, {
    action: AuditAction.TemplateUpdated,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: { section, hall: { from, to: name } },
  })
  return count
}

/**
 * Before a parallel hall is added to a section, its parts outside any hall become its main hall, first in order:
 * otherwise they would read as before the halls rather than in one. How many parts it moved; none for a section
 * already in halls. The part that brings the new hall is written by the caller, with its audit.
 */
export async function splitSectionIntoHalls(
  db: TransactionClient,
  templateId: number,
  section: string,
  mainHall: string,
  congregationId: number,
) {
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section, track: '' },
    data: { track: sanitizeText(mainHall).trim(), trackOrder: 1 },
  })
  return count
}

/** Moves the template's parts from `order` on by one, so a part written at `order` sits in its place. */
export async function makeRoomAtTemplateOrder(
  db: TransactionClient,
  templateId: number,
  order: number,
  congregationId: number,
) {
  await db.templatePart.updateMany({
    where: { templateId, congregationId, order: { gte: order } },
    data: { order: { increment: 1 } },
  })
}
