import { isSystemTemplate } from '~/features/events/model/event-template.type'
import {
  setTemplatePartAllowedRoles,
  setTemplateServicePartAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

const responsibleInclude = {
  include: { user: { include: { member: { select: { firstname: true, lastname: true } } } } },
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
) {
  // System templates (day-off, freeform) back domain concepts referenced by
  // key. Renaming, restructuring, or rescheduling them would silently break
  // the createDayOff / createFreeformEvent lookups. The settings UI already
  // presents them as read-only except for the colour swatch; this is the
  // belt-and-suspenders check on the writer.
  const existing = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { key: true },
  })
  const scoped = existing != null && isSystemTemplate(existing.key) ? { color: data.color } : data
  if (Object.values(scoped).every(v => v === undefined)) return null

  return db.eventTemplate.update({
    where: {
      id_congregationId: { id: templateId, congregationId },
    },
    data: {
      ...scoped,
      ...(scoped.name != null ? { name: sanitizeText(scoped.name) } : {}),
      ...(scoped.description != null ? { description: sanitizeText(scoped.description) } : {}),
    },
  })
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

export async function reorderTemplateParts(
  db: TransactionClient,
  congregationId: number,
  orderedIds: number[],
): Promise<void> {
  await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_005, congregationId)

  for (let i = 0; i < orderedIds.length; i++) {
    await db.templatePart.update({
      where: {
        id_congregationId: { id: orderedIds[i], congregationId },
      },
      data: { order: i * 5 },
    })
  }
}

export function setTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  userId: number,
  congregationId: number,
) {
  return db.templateResponsible.upsert({
    where: {
      templateId_congregationId: { templateId, congregationId },
    },
    update: { userId },
    create: {
      templateId,
      userId,
      congregationId,
    },
  })
}

export function removeTemplateResponsible(db: TransactionClient, templateId: number, congregationId: number) {
  return db.templateResponsible.deleteMany({
    where: { templateId, congregationId },
  })
}

export function isTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  userId: number,
  congregationId: number,
) {
  return db.templateResponsible.findFirst({
    where: { templateId, userId, congregationId },
  })
}

export type DeleteTemplateResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'not-found' | 'system' }
  | { ok: false; reason: 'in-use'; eventCount: number }

export async function deleteTemplate(
  db: TransactionClient,
  templateId: number,
  congregationId: number,
): Promise<DeleteTemplateResult> {
  const template = await db.eventTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { key: true, name: true, _count: { select: { events: true } } },
  })
  if (!template) return { ok: false, reason: 'not-found' }

  // System templates (day-off, freeform) back domain concepts looked up by
  // key at runtime — createDayOff / createFreeformEvent would break if the row
  // disappeared. Same guard as updateTemplate / duplicateTemplate.
  if (isSystemTemplate(template.key)) return { ok: false, reason: 'system' }

  // Event.templateId is ON DELETE SET NULL: deleting a template still linked to
  // events would orphan them (templateId → NULL), and downstream queries that
  // filter on template.key silently drop null-template rows — the exact bug the
  // 20260720* migration series had to repair. Refuse rather than orphan.
  if (template._count.events > 0) return { ok: false, reason: 'in-use', eventCount: template._count.events }

  // parts, serviceParts, responsibles and their allowed-role rows all cascade
  // (onDelete: Cascade) from the template FK, so the single delete is enough.
  await db.eventTemplate.delete({
    where: { id_congregationId: { id: templateId, congregationId } },
  })

  return { ok: true, name: template.name }
}
