import { isSystemTemplate } from '~/features/events/model/event-template.type'
import { ResponsibilityScope, scopesCovering } from '~/features/events/model/responsibility-scope.type'
import {
  setTemplatePartAllowedRoles,
  setTemplateServicePartAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
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
      serviceParts: { orderBy: { name: 'asc' } },
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
  },
  congregationId: number,
  actorId: number,
) {
  // System templates (day-off, freeform) back domain concepts referenced by
  // key. Renaming, restructuring, or rescheduling them would silently break
  // the createDayOff / createFreeformEvent lookups. The settings UI already
  // presents them as read-only except for the colour swatch; this is the
  // belt-and-suspenders check on the writer.
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
    },
  })
  const scoped = existing != null && isSystemTemplate(existing.key) ? { color: data.color } : data
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

export async function upsertTemplatePart(
  db: TransactionClient,
  templateId: number,
  partData: {
    id?: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    speakerLabel?: string | null
    readerLabel?: string | null
    // The kind this part defaults to. Null where the template genuinely cannot
    // know — the ministry parts change kind weekly and are set per event.
    presetId?: number | null
    // Optional on purpose: undefined means the caller does not manage the
    // slot, [] means it does and the selection is empty.
    allowedSpeakerRoleIds?: number[]
    allowedReaderRoleIds?: number[]
  },
  congregationId: number,
  actorId: number,
) {
  const baseData = {
    name: sanitizeText(partData.name),
    section: sanitizeText(partData.section),
    track: sanitizeText(partData.track),
    trackOrder: partData.trackOrder,
    order: partData.order,
    durationMin: partData.durationMin,
    allowExternalSpeaker: partData.allowExternalSpeaker,
    speakerLabel: partData.speakerLabel,
    readerLabel: partData.readerLabel,
    presetId: partData.presetId ?? null,
  }

  const part = partData.id
    ? await db.templatePart.update({
        where: { id_congregationId: { id: partData.id, congregationId } },
        data: baseData,
      })
    : await db.templatePart.create({
        data: { ...baseData, templateId, congregationId },
      })

  const noChange = { added: [] as number[], removed: [] as number[] }
  const speakerDiff = partData.allowedSpeakerRoleIds
    ? await setTemplatePartAllowedRoles(db, part.id, 'speaker', partData.allowedSpeakerRoleIds, congregationId)
    : noChange
  const readerDiff = partData.allowedReaderRoleIds
    ? await setTemplatePartAllowedRoles(db, part.id, 'reader', partData.allowedReaderRoleIds, congregationId)
    : noChange

  if (
    speakerDiff.added.length > 0 ||
    speakerDiff.removed.length > 0 ||
    readerDiff.added.length > 0 ||
    readerDiff.removed.length > 0
  ) {
    audit({
      action: AuditAction.PartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'TemplatePart',
      entityId: part.id,
      metadata: { speaker: speakerDiff, reader: readerDiff },
    })
  }

  return part
}

export function deleteTemplatePart(db: TransactionClient, partId: number, congregationId: number) {
  return db.templatePart.delete({
    where: {
      id_congregationId: { id: partId, congregationId },
    },
  })
}

export async function upsertTemplateServicePart(
  db: TransactionClient,
  templateId: number,
  roleData: { id?: number; name: string; key: string; allowedRoleIds: number[] },
  congregationId: number,
  actorId: number,
) {
  const servicePart = roleData.id
    ? await db.templateServicePart.update({
        where: { id_congregationId: { id: roleData.id, congregationId } },
        data: { name: roleData.name, key: roleData.key },
      })
    : await db.templateServicePart.create({
        data: { name: roleData.name, key: roleData.key, templateId, congregationId },
      })

  const diff = await setTemplateServicePartAllowedRoles(db, servicePart.id, roleData.allowedRoleIds, congregationId)

  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServicePartAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'TemplateServicePart',
      entityId: servicePart.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return servicePart
}

export function deleteTemplateServicePart(db: TransactionClient, roleId: number, congregationId: number) {
  return db.templateServicePart.delete({
    where: {
      id_congregationId: { id: roleId, congregationId },
    },
  })
}

/**
 * Puts a template's parts in the given order. Writes nothing and answers false when an id is not a part of this
 * template: the caller was authorised on this template, not on whichever template a posted id belongs to.
 */
export async function reorderTemplateParts(
  db: TransactionClient,
  congregationId: number,
  templateId: number,
  orderedIds: number[],
): Promise<boolean> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_005, congregationId)
  const owned = await db.templatePart.count({ where: { id: { in: orderedIds }, templateId, congregationId } })
  if (owned !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) return false

  for (let i = 0; i < orderedIds.length; i++) {
    await db.templatePart.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
  return true
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
