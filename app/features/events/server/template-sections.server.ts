import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { type ItemOwner, ownerWhere } from '~/features/events/server/template-owner'
import { AuditAction, auditInTransaction } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// A template's sections exist by its parts: each part carries its section's name. These write them across the parts
// that carry them; a part's rooms are its room rows (template-rooms.server.ts).

/**
 * The schedule template the page edits, whose parts are written and on which the change is recorded, with the kind
 * they are filed under (null when no kind uses it).
 */
export interface TemplateSectionTarget {
  templateId: number | null
  scheduleTemplateId: number
}

/**
 * What a rename did: renamed, or why not (nothing left once sanitized, the same name, one already carried, nothing
 * carrying the old one).
 */
export type SectionRename = 'renamed' | 'blank' | 'unchanged' | 'taken' | 'gone'

/** Renames a section on every part of the template in it; never to a name another section carries (that would merge). */
export async function renameTemplateSection(
  db: TransactionClient,
  target: TemplateSectionTarget,
  from: string,
  to: string,
  congregationId: number,
  actorId: number,
): Promise<SectionRename> {
  const name = sanitizeText(to).trim()
  if (name === '') return 'blank'
  if (name === from) return 'unchanged'
  const own = { ...ownerWhere(target), congregationId }
  if (await db.templatePart.findFirst({ where: { ...own, section: name }, select: { id: true } })) return 'taken'
  const { count } = await db.templatePart.updateMany({ where: { ...own, section: from }, data: { section: name } })
  if (count === 0) return 'gone'
  if (target.templateId != null) await syncTemplateScheduleTemplates(db, target.templateId, congregationId)
  await recordOnScheduleTemplate(db, target.scheduleTemplateId, congregationId, actorId, {
    section: { from, to: name },
  })
  return 'renamed'
}

/** A part's place (section, order) before a write moves it; null when not the template's. */
export async function templatePartPlace(
  db: TransactionClient,
  owner: ItemOwner,
  partId: number,
  congregationId: number,
) {
  return db.templatePart.findFirst({
    where: { id: partId, ...ownerWhere(owner), congregationId },
    select: { section: true, order: true },
  })
}

/**
 * Whether a section is carried by another part of the template: what a part edited may be moved to, picked among
 * what exists. No section always exists. One renamed or emptied elsewhere since the form opened is not there any more.
 */
export async function placeExists(
  db: TransactionClient,
  owner: ItemOwner,
  section: string,
  partId: number,
  congregationId: number,
) {
  if (section === '') return true
  const found = await db.templatePart.findFirst({
    where: { ...ownerWhere(owner), congregationId, section, NOT: { id: partId } },
    select: { id: true },
  })
  return found != null
}

/**
 * Where a part goes at the end of a section (« La partie va à la fin de la section choisie »): after the section's
 * last part, or at the end of the template when the section has none. A part out of any section goes to the end of
 * the template, as « Ajouter une partie hors section » adds one: the parts outside a section are spread over the
 * programme. The part being moved (`partId`) does not count.
 */
export async function orderAtEndOf(
  db: TransactionClient,
  owner: ItemOwner,
  section: string,
  partId: number | null,
  congregationId: number,
) {
  const others = { ...ownerWhere(owner), congregationId, ...(partId != null && { NOT: { id: partId } }) }
  const groups = section === '' ? [others] : [{ ...others, section }, others]
  for (const where of groups) {
    const { _max } = await db.templatePart.aggregate({ where, _max: { order: true } })
    if (_max.order != null) return _max.order + 1
  }
  return 0
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
  owner: ItemOwner,
  order: number,
  congregationId: number,
) {
  await db.templatePart.updateMany({
    where: { ...ownerWhere(owner), congregationId, order: { gte: order } },
    data: { order: { increment: 1 } },
  })
}
