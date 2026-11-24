import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// A template's sections and halls exist by its parts: each part carries its section's name and, in parallel halls,
// its hall's (`track`). These write them across the parts that carry them.

/** The kind whose parts are written, and the schedule template the page edits, on which the change is recorded. */
export interface TemplateSectionTarget {
  templateId: number
  scheduleTemplateId: number
}

/** What a rename did: renamed, or why not (the same name, one already carried, nothing carrying the old one). */
export type SectionRename = 'renamed' | 'unchanged' | 'taken' | 'gone'

/** Renames a section on every part of the template in it; never to a name another section carries (that would merge). */
export async function renameTemplateSection(
  db: TransactionClient,
  { templateId, scheduleTemplateId }: TemplateSectionTarget,
  from: string,
  to: string,
  congregationId: number,
  actorId: number,
): Promise<SectionRename> {
  const name = sanitizeText(to).trim()
  if (name === from) return 'unchanged'
  if (await db.templatePart.findFirst({ where: { templateId, congregationId, section: name }, select: { id: true } }))
    return 'taken'
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section: from },
    data: { section: name },
  })
  if (count === 0) return 'gone'
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await recordOnScheduleTemplate(db, scheduleTemplateId, congregationId, actorId, { section: { from, to: name } })
  return 'renamed'
}

/** Renames a hall within its section, on every part in it; never to the name of another hall of the section. */
export async function renameTemplateHall(
  db: TransactionClient,
  { templateId, scheduleTemplateId }: TemplateSectionTarget,
  section: string,
  from: string,
  to: string,
  congregationId: number,
  actorId: number,
): Promise<SectionRename> {
  const name = sanitizeText(to).trim()
  if (name === from) return 'unchanged'
  if (
    await db.templatePart.findFirst({
      where: { templateId, congregationId, section, track: name },
      select: { id: true },
    })
  )
    return 'taken'
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section, track: from },
    data: { track: name },
  })
  if (count === 0) return 'gone'
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await recordOnScheduleTemplate(db, scheduleTemplateId, congregationId, actorId, {
    hall: { section, from, to: name },
  })
  return 'renamed'
}

/**
 * When a section's first parallel hall is added, its parts outside any hall become its main hall, first in order:
 * otherwise they would read as before the halls rather than in one. Only then: never for the parts outside any
 * section, nor for a section already in halls (its parts outside them stay where they are). How many parts it moved.
 */
export async function splitSectionIntoHalls(
  db: TransactionClient,
  { templateId, scheduleTemplateId }: TemplateSectionTarget,
  section: string,
  mainHall: string,
  congregationId: number,
  actorId: number,
) {
  if (section === '') return 0
  const inHalls = await db.templatePart.findFirst({
    where: { templateId, congregationId, section, NOT: { track: '' } },
    select: { id: true },
  })
  if (inHalls) return 0
  const split = sanitizeText(mainHall).trim()
  const { count } = await db.templatePart.updateMany({
    where: { templateId, congregationId, section, track: '' },
    data: { track: split, trackOrder: 1 },
  })
  if (count > 0) {
    await recordOnScheduleTemplate(db, scheduleTemplateId, congregationId, actorId, {
      hall: { section, split, parts: count },
    })
  }
  return count
}

function recordOnScheduleTemplate(
  db: TransactionClient,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
  metadata: Record<string, unknown>,
) {
  return auditInTransaction(db, {
    action: AuditAction.ScheduleTemplateUpdated,
    congregationId,
    actorId,
    entityType: 'ScheduleTemplate',
    entityId: scheduleTemplateId,
    metadata,
  })
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
