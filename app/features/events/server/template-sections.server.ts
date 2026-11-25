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

/**
 * What a rename did: renamed, or why not (nothing left once sanitized, the same name, one already carried, nothing
 * carrying the old one).
 */
export type SectionRename = 'renamed' | 'blank' | 'unchanged' | 'taken' | 'gone'

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
  if (name === '') return 'blank'
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
  if (name === '') return 'blank'
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

/**
 * A section left with one hall (its other hall's last part deleted, or moved away) is no longer in parallel: that
 * hall's parts go back to the section, outside any hall. Only the sections given, those the write touched. How many
 * parts it moved.
 */
export async function mergeLoneHalls(
  db: TransactionClient,
  { templateId, scheduleTemplateId }: TemplateSectionTarget,
  sections: readonly string[],
  congregationId: number,
  actorId: number,
) {
  let moved = 0
  for (const section of new Set(sections)) {
    const halls = await db.templatePart.findMany({
      where: { templateId, congregationId, section, NOT: { track: '' } },
      select: { track: true },
      distinct: ['track'],
    })
    const [lone] = halls
    if (halls.length !== 1 || lone == null) continue
    const { count } = await db.templatePart.updateMany({
      where: { templateId, congregationId, section, track: lone.track },
      data: { track: '', trackOrder: null },
    })
    moved += count
    await recordOnScheduleTemplate(db, scheduleTemplateId, congregationId, actorId, {
      hall: { section, merged: lone.track, parts: count },
    })
  }
  return moved
}

/** A part's place (section, hall, hall order, order) before a write moves or deletes it; null when not the template's. */
export async function templatePartPlace(
  db: TransactionClient,
  templateId: number,
  partId: number,
  congregationId: number,
) {
  return db.templatePart.findFirst({
    where: { id: partId, templateId, congregationId },
    select: { section: true, track: true, trackOrder: true, order: true },
  })
}

/**
 * A hall's place among its section's parallel halls: the hall's own when it exists, else the next after the section's
 * halls (2 for a section's first, whose parts become the main hall, 1). Null for no hall. Never from the form: no
 * field sets it, and a hall without one lists before the main hall here but after it on a meeting.
 */
export async function roomOrderFor(
  db: TransactionClient,
  templateId: number,
  section: string,
  track: string,
  partId: number | null,
  congregationId: number,
) {
  if (track === '') return null
  const others = { templateId, congregationId, section, ...(partId != null && { NOT: { id: partId } }) }
  const own = await db.templatePart.findFirst({
    where: { ...others, track, trackOrder: { not: null } },
    select: { trackOrder: true },
  })
  if (own?.trackOrder != null) return own.trackOrder
  const { _max } = await db.templatePart.aggregate({
    where: { AND: [others, { NOT: { track: '' } }] },
    _max: { trackOrder: true },
  })
  return (_max.trackOrder ?? 1) + 1
}

/**
 * Whether a section, and a hall in it, is carried by another part of the template: what a part edited may be moved
 * to, picked among what exists. No section and no hall always exist. One renamed or emptied elsewhere since the form
 * opened is not there any more.
 */
export async function placeExists(
  db: TransactionClient,
  templateId: number,
  section: string,
  track: string,
  partId: number,
  congregationId: number,
) {
  if (section === '' && track === '') return true
  const found = await db.templatePart.findFirst({
    where: {
      templateId,
      congregationId,
      NOT: { id: partId },
      ...(section !== '' && { section }),
      ...(track !== '' && { section, track }),
    },
    select: { id: true },
  })
  return found != null
}

/**
 * Where a part goes at the end of a hall or a section (« La partie va à la fin de la section choisie »): after the
 * group's last part, or after its section's when the group has none, or at the end of the template. A part out of
 * any section goes to the end of the template, as « Ajouter une partie hors section » adds one: the parts outside a
 * section are spread over the programme. The part being moved (`partId`) does not count.
 */
export async function orderAtEndOf(
  db: TransactionClient,
  templateId: number,
  section: string,
  track: string,
  partId: number | null,
  congregationId: number,
) {
  const others = { templateId, congregationId, ...(partId != null && { NOT: { id: partId } }) }
  const groups = section === '' ? [others] : [{ ...others, section, track }, { ...others, section }, others]
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
  templateId: number,
  order: number,
  congregationId: number,
) {
  await db.templatePart.updateMany({
    where: { templateId, congregationId, order: { gte: order } },
    data: { order: { increment: 1 } },
  })
}
