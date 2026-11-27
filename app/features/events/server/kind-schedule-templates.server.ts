import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// The schedule templates a meeting type uses, chosen on its page (6b-2): one programme template at most (a meeting
// holds one programme), as many duties templates as wanted, each a schedule of its own on the type's new meetings (user,
// 2026-11-27), each once.

export type AddKindScheduleTemplateRefusal = 'sort-used' | 'used' | 'system'

function changed(kindId: number, congregationId: number, actorId: number, metadata: Record<string, unknown>) {
  audit({
    action: AuditAction.TemplateScheduleTemplatesChanged,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: kindId,
    metadata,
  })
}

/** The type and its links, or null when it is not the congregation's. */
function kindWithLinks(db: TransactionClient, kindId: number, congregationId: number) {
  return db.eventTemplate.findFirst({
    where: { id: kindId, congregationId },
    select: {
      key: true,
      scheduleTemplates: {
        orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
        select: { scheduleTemplateId: true, order: true, scheduleTemplate: { select: { kind: true } } },
      },
    },
  })
}

/** The type comes to use a schedule template, after those it uses; its items reach its new meetings whole. */
export async function addKindScheduleTemplate(
  db: TransactionClient,
  kindId: number,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
): Promise<{ ok: true } | { ok: false; reason: AddKindScheduleTemplateRefusal } | null> {
  // Two adds at once would both pass the one-per-sort check: the type's row is locked first, as its sync locks it.
  await db.$queryRaw`SELECT "id" FROM "EventTemplate" WHERE "id" = ${kindId} AND "congregationId" = ${congregationId} FOR UPDATE`
  const [kind, template] = await Promise.all([
    kindWithLinks(db, kindId, congregationId),
    db.scheduleTemplate.findFirst({ where: { id: scheduleTemplateId, congregationId }, select: { kind: true } }),
  ])
  if (kind == null || template == null) return null
  // « Autre évènement » holds no schedule: its meetings take one from the meeting page.
  if (isSystemTemplate(kind.key)) return { ok: false, reason: 'system' }
  if (kind.scheduleTemplates.some(link => link.scheduleTemplateId === scheduleTemplateId)) {
    return { ok: false, reason: 'used' }
  }
  const programmeHeld = kind.scheduleTemplates.some(link => link.scheduleTemplate.kind === ScheduleKind.Programme)
  if (template.kind === ScheduleKind.Programme && programmeHeld) return { ok: false, reason: 'sort-used' }
  const order = Math.max(-1, ...kind.scheduleTemplates.map(link => link.order)) + 1
  await db.eventKindScheduleTemplate.create({
    data: { eventKindId: kindId, scheduleTemplateId, order, congregationId },
  })
  changed(kindId, congregationId, actorId, { added: scheduleTemplateId })
  return { ok: true }
}

/**
 * The type stops using a schedule template. Its rows filed under the type in it become the template's own (as written
 * from « Modèles de planning » since 6b-1): left under the type, the kind's next sync would take them into a template
 * of its own, and deleting the type would take them from this one. Meetings made already keep their schedules.
 */
export async function removeKindScheduleTemplate(
  db: TransactionClient,
  kindId: number,
  scheduleTemplateId: number,
  congregationId: number,
  actorId: number,
): Promise<{ ok: true } | null> {
  const removed = await db.eventKindScheduleTemplate.deleteMany({
    where: { eventKindId: kindId, scheduleTemplateId, congregationId },
  })
  if (removed.count === 0) return null
  const filed = { templateId: kindId, scheduleTemplateId, congregationId }
  await db.templatePart.updateMany({ where: filed, data: { templateId: null } })
  await db.templateServicePart.updateMany({ where: filed, data: { templateId: null } })
  changed(kindId, congregationId, actorId, { removed: scheduleTemplateId })
  return { ok: true }
}

/** The order of the type's schedule templates, as listed: exactly those it uses, or null. */
export async function orderKindScheduleTemplates(
  db: TransactionClient,
  kindId: number,
  scheduleTemplateIds: number[],
  congregationId: number,
  actorId: number,
): Promise<{ ok: true } | null> {
  const kind = await kindWithLinks(db, kindId, congregationId)
  if (kind == null) return null
  const used = kind.scheduleTemplates.map(link => link.scheduleTemplateId)
  const same =
    used.length === scheduleTemplateIds.length &&
    new Set(scheduleTemplateIds).size === used.length &&
    scheduleTemplateIds.every(id => used.includes(id))
  if (!same) return null
  for (const [order, scheduleTemplateId] of scheduleTemplateIds.entries()) {
    await db.eventKindScheduleTemplate.updateMany({
      where: { eventKindId: kindId, scheduleTemplateId, congregationId },
      data: { order },
    })
  }
  changed(kindId, congregationId, actorId, { order: scheduleTemplateIds })
  return { ok: true }
}
