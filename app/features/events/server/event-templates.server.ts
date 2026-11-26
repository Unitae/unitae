import type { AttendanceKind } from '~/features/events/model/attendance-kind.type'
import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { ResponsibilityScope } from '~/features/events/model/responsibility-scope.type'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { TEMPLATE_PROGRAMME_COUNT } from '~/features/events/server/give-programme.server'
import { syncTemplateScheduleTemplates } from '~/features/events/server/schedule-templates.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

// Both scopes come back on the relation; callers pick with `findResponsible`
// rather than indexing [0], which stopped meaning "the responsible" once a
// template could name two. The ordering only keeps the array stable across
// reads so rendering and snapshots do not flip on row insertion order.
const responsibleInclude = {
  include: { role: { select: { id: true, key: true, name: true } } },
  orderBy: { scope: 'asc' },
} as const

export function getTemplates(db: TransactionClient, congregationId: number) {
  return db.eventTemplate.findMany({
    where: { congregationId },
    include: {
      // Its items: those of the schedule templates it uses (6b-0), beside its events.
      _count: { select: { events: true, ...TEMPLATE_PROGRAMME_COUNT._count.select } },
      scheduleTemplates: TEMPLATE_PROGRAMME_COUNT.scheduleTemplates,
      responsibles: responsibleInclude,
    },
    orderBy: { name: 'asc' },
  })
}

export function getTemplateById(db: TransactionClient, templateId: number, congregationId: number) {
  return db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceParts: { orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      responsibles: responsibleInclude,
    },
  })
}

export async function updateTemplate(
  db: TransactionClient,
  templateId: number,
  data: {
    name?: string
    weekDay?: number | null
    isRecurring?: boolean
    description?: string
    color?: string
    startTime?: string
    endTime?: string
    attendanceKind?: AttendanceKind
  },
  congregationId: number,
  actorId: number,
) {
  // System templates (freeform) back domain concepts referenced by key: createFreeformEvent looks its own up. The
  // settings UI already presents them as read-only except for the colour swatch; this is the belt-and-suspenders check
  // on the writer.
  const existing = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: {
      key: true,
      name: true,
      weekDay: true,
      isRecurring: true,
      description: true,
      color: true,
      startTime: true,
      endTime: true,
      attendanceKind: true,
    },
  })
  // Recurrence is « has a weekday »: the column follows the day whenever the day is written.
  const withRecurrence = data.weekDay !== undefined ? { ...data, isRecurring: data.weekDay != null } : data
  const scoped = existing != null && isSystemTemplate(existing.key) ? { color: data.color } : withRecurrence
  // Only what differs from the saved template is written and logged: a save that changes nothing leaves no trace.
  const changed = Object.fromEntries(
    Object.entries(scoped).filter(
      ([field, value]) =>
        value !== undefined && (existing == null || existing[field as keyof typeof existing] !== value),
    ),
  ) as typeof scoped
  if (Object.keys(changed).length === 0) return null

  const updated = await db.eventTemplate.update({
    where: {
      id_congregationId: { id: templateId, congregationId },
    },
    data: {
      ...changed,
      ...(changed.name != null ? { name: sanitizeText(changed.name) } : {}),
      ...('description' in changed && changed.description != null
        ? { description: sanitizeText(changed.description) }
        : {}),
    },
  })
  // Its schedule templates keep their own names: Réglages › « Modèles de planning » names them (user, 2026-11-24).
  audit({
    action: AuditAction.TemplateUpdated,
    congregationId,
    actorId,
    entityType: 'EventTemplate',
    entityId: templateId,
    metadata: { fields: Object.keys(changed) },
  })
  return updated
}

/**
 * Name the role responsible for one scope of a template's events.
 *
 * `scope` defaults to the whole-event delegation so the ~20 existing call sites
 * and their tests keep meaning what they meant; the service pickers pass
 * `ResponsibilityScope.Service` explicitly.
 */
export async function setTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  roleId: number,
  congregationId: number,
  scope: ResponsibilityScope = ResponsibilityScope.Programme,
) {
  const responsible = await db.templateResponsible.upsert({
    where: {
      templateId_scope_congregationId: { templateId, scope, congregationId },
    },
    update: { roleId },
    create: {
      templateId,
      roleId,
      scope,
      congregationId,
    },
  })
  // The schedule template of that scope holds the responsible (6b-1b): the row is only what a new one starts from.
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await setScopeTemplateRole(db, templateId, scope, roleId, congregationId)
  return responsible
}

export async function removeTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  scope: ResponsibilityScope = ResponsibilityScope.Programme,
) {
  const removed = await db.templateResponsible.deleteMany({
    where: { templateId, scope, congregationId },
  })
  await syncTemplateScheduleTemplates(db, templateId, congregationId)
  await setScopeTemplateRole(db, templateId, scope, null, congregationId)
  return removed
}

/** The role of the kind's first schedule template of a scope's sort: its programme's, or its duties'. */
async function setScopeTemplateRole(
  db: TransactionClient,
  templateId: number,
  scope: ResponsibilityScope,
  roleId: number | null,
  congregationId: number,
) {
  const kind = scope === ResponsibilityScope.Service ? ScheduleKind.Duty : ScheduleKind.Programme
  const link = await db.eventKindScheduleTemplate.findFirst({
    where: { eventKindId: templateId, congregationId, scheduleTemplate: { kind } },
    orderBy: [{ order: 'asc' }, { scheduleTemplateId: 'asc' }],
    select: { scheduleTemplateId: true },
  })
  if (link == null) return
  await db.scheduleTemplate.update({
    where: { id_congregationId: { id: link.scheduleTemplateId, congregationId } },
    data: { responsibleRoleId: roleId },
  })
}
