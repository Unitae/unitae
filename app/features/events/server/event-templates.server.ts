import type { AttendanceKind } from '~/features/events/model/attendance-kind.type'
import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { ResponsibilityScope, scopesCovering } from '~/features/events/model/responsibility-scope.type'
import { resolveEffectiveRoleIds } from '~/shared/auth/permissions.server'
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
      _count: { select: { parts: true, serviceParts: true, events: true } },
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
export function setTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  roleId: number,
  congregationId: number,
  scope: ResponsibilityScope = ResponsibilityScope.Programme,
) {
  return db.templateResponsible.upsert({
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
}

export function removeTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
  scope: ResponsibilityScope = ResponsibilityScope.Programme,
) {
  return db.templateResponsible.deleteMany({
    where: { templateId, scope, congregationId },
  })
}

/**
 * The responsible row for this template, if the caller holds the role it points at.
 *
 * Still keyed by `userId` from the caller's side — the question routes ask has not changed —
 * but the answer now goes through the role. `resolveEffectiveRoleIds` is the canonical
 * resolver and unions the account-bound and member-bound assignment paths; hand-rolling that
 * OR is how the two drift apart.
 *
 * The empty guard is not just an optimisation: `roleId: { in: [] }` matches nothing, so
 * without it a user with no roles would get the right answer for the wrong reason.
 *
 * `scope` is what the caller wants to touch, not what the row says: asking about the service
 * parts also accepts the whole-event delegation. See `scopesCovering`.
 */
export async function isTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  userId: number,
  congregationId: number,
  scope: ResponsibilityScope = ResponsibilityScope.Programme,
) {
  const roleIds = await resolveEffectiveRoleIds(db, userId, congregationId)
  if (roleIds.length === 0) return null

  return db.templateResponsible.findFirst({
    where: { templateId, congregationId, roleId: { in: roleIds }, scope: { in: scopesCovering(scope) } },
  })
}
