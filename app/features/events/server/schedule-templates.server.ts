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
    // Its name belongs to Réglages › « Modèles de planning » since 6a: the kind gives it one on creation only. Its
    // responsible still follows the kind's TemplateResponsible rows, which that page writes too until 6a-2.
    if (existing.responsibleRoleId !== responsibleRoleId) {
      await db.scheduleTemplate.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
        data: { responsibleRoleId },
      })
    }
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

/** Deletes the schedule templates only this template suggests: they go with it. */
export async function deleteTemplateScheduleTemplates(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
) {
  await db.scheduleTemplate.deleteMany({
    where: {
      congregationId,
      eventKinds: { some: { eventKindId: templateId }, every: { eventKindId: templateId } },
    },
  })
}
