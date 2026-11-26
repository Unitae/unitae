import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import {
  SCHEDULE_KINDS,
  SCHEDULE_ORDER,
  ScheduleKind,
  UNNAMED_SCHEDULE_KEY,
} from '~/features/events/model/schedule.type'
import type { TransactionClient } from '~/shared/infra/db.server'

// A template's schedule templates, written beside its own items and responsibles until the readers move over. The rule
// is the add_schedules migration's, for one template: keep the two in step. While it lasts, a template has one schedule
// template of each kind at most: nothing in the database says so, the lock below keeps it.

/**
 * Gives a template the schedule templates its items call for, and brings them up to date: a programme one named after
 * it when it has parts, a duty one when it has services (no name: the catalogue names it), suggested by it in that
 * order. The programme responsible answers for the programme; the service responsible for the duties, and nobody
 * else: without one the duties are the managers' (user, 2026-11-24, which replaced D31's fallback). Names are written
 * on creation only: Réglages › « Modèles de planning » owns them after. Its items join the one of their kind. Never a system template's (the freeform one, which the
 * migration names by its key). Idempotent.
 */
export async function syncTemplateScheduleTemplates(db: TransactionClient, templateId: number, congregationId: number) {
  // Two writers syncing one template at the same moment would each make its schedule templates: inside the caller's
  // transaction, its row is locked first (the order of every path that creates events of a template).
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ${templateId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: {
      key: true,
      name: true,
      responsibles: { select: { roleId: true, scope: true } },
      _count: { select: { parts: true, serviceParts: true } },
      scheduleTemplates: {
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
        select: { scheduleTemplate: { select: { id: true, kind: true, name: true, responsibleRoleId: true } } },
      },
    },
  })
  if (!template || isSystemTemplate(template.key)) return

  const roleOf = (scope: string) => template.responsibles.find(row => row.scope === scope)?.roleId ?? null
  const wanted = {
    [ScheduleKind.Programme]: {
      hasItems: template._count.parts > 0,
      name: template.name,
      responsibleRoleId: roleOf(ResponsibilityScope.Programme),
    },
    [ScheduleKind.Duty]: {
      hasItems: template._count.serviceParts > 0,
      name: null,
      // Its own responsible only: without one the managers see to it, whoever runs the programme (user, 2026-11-24).
      responsibleRoleId: roleOf(ResponsibilityScope.Service),
    },
  }

  for (const kind of SCHEDULE_KINDS) {
    const existing = template.scheduleTemplates.find(link => link.scheduleTemplate.kind === kind)?.scheduleTemplate
    await syncScheduleTemplate(db, { templateId, congregationId, kind, existing, ...wanted[kind] })
  }
}

/** One kind of a template's schedule template: brought up to date, or made when its items call for it. */
async function syncScheduleTemplate(
  db: TransactionClient,
  input: {
    templateId: number
    congregationId: number
    kind: ScheduleKind
    existing: { id: number; name: string | null; responsibleRoleId: number | null } | undefined
    hasItems: boolean
    name: string | null
    responsibleRoleId: number | null
  },
) {
  const { templateId, congregationId, kind, existing, hasItems, name, responsibleRoleId } = input
  let scheduleTemplateId: number
  if (existing) {
    scheduleTemplateId = existing.id
    // Its name and responsible belong to Réglages › « Modèles de planning » (6a, 6b-1b): the kind gives them on
    // creation only.
  } else if (hasItems) {
    const created = await db.scheduleTemplate.create({
      data: {
        name,
        key: name == null ? UNNAMED_SCHEDULE_KEY[kind] : null,
        kind,
        responsibleRoleId,
        congregationId,
        eventKinds: { create: { eventKindId: templateId, order: SCHEDULE_ORDER[kind], congregationId } },
      },
    })
    scheduleTemplateId = created.id
  } else return

  const elsewhere = {
    templateId,
    congregationId,
    OR: [{ scheduleTemplateId: null }, { scheduleTemplateId: { not: scheduleTemplateId } }],
  }
  if (kind === ScheduleKind.Programme) {
    await db.templatePart.updateMany({ where: elsewhere, data: { scheduleTemplateId } })
  } else {
    await db.templateServicePart.updateMany({ where: elsewhere, data: { scheduleTemplateId } })
  }
}

/**
 * Writes a kind's TemplateResponsible rows onto its first schedule template of each sort, none when a scope has no row:
 * what the sync did on every pass until 6b-1b, kept for restoring an archive whose kinds hold their responsibles there
 * alone (2.20 and older, which carries no schedule templates), so restoring gives what migrating live data gave.
 */
export async function applyKindResponsibles(db: TransactionClient, templateId: number, congregationId: number) {
  const kind = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: {
      responsibles: { select: { roleId: true, scope: true } },
      scheduleTemplates: {
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
        select: { scheduleTemplate: { select: { id: true, kind: true, responsibleRoleId: true } } },
      },
    },
  })
  if (kind == null) return
  const scopeOf = {
    [ScheduleKind.Programme]: ResponsibilityScope.Programme,
    [ScheduleKind.Duty]: ResponsibilityScope.Service,
  }
  for (const sort of SCHEDULE_KINDS) {
    const first = kind.scheduleTemplates.find(link => link.scheduleTemplate.kind === sort)?.scheduleTemplate
    if (first == null) continue
    const roleId = kind.responsibles.find(row => row.scope === scopeOf[sort])?.roleId ?? null
    if (first.responsibleRoleId === roleId) continue
    await db.scheduleTemplate.update({
      where: { id_congregationId: { id: first.id, congregationId } },
      data: { responsibleRoleId: roleId },
    })
  }
}

/**
 * Deletes the schedule templates only this template suggests: they go with it, every item in them first — the kind's
 * own rows and those a template holds under no kind (6b-1), which could not be left with no owner. The kind's rows in
 * a template another kind uses stay there, as that template's own.
 */
export async function deleteTemplateScheduleTemplates(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
) {
  const only = await db.scheduleTemplate.findMany({
    where: {
      congregationId,
      eventKinds: { some: { eventKindId: templateId }, every: { eventKindId: templateId } },
    },
    select: { id: true },
  })
  const ids = only.map(each => each.id)
  if (ids.length > 0) {
    const where = { scheduleTemplateId: { in: ids }, congregationId }
    await db.templatePart.deleteMany({ where })
    await db.templateServicePart.deleteMany({ where })
    await db.scheduleTemplate.deleteMany({ where: { id: { in: ids }, congregationId } })
  }
  // Its rows in the templates other types still use become those templates' own (6b-2): the kind's cascade would take
  // them out of a template another type gives its meetings.
  const kept = { templateId, scheduleTemplateId: { not: null }, congregationId }
  await db.templatePart.updateMany({ where: kept, data: { templateId: null } })
  await db.templateServicePart.updateMany({ where: kept, data: { templateId: null } })
}
