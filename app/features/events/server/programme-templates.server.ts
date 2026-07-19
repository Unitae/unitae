import { isSystemTemplate } from '~/features/events/model/programme-template.type'
import {
  setTemplatePartAllowedRoles,
  setTemplateServiceRoleAllowedRoles,
} from '~/features/events/server/allowed-roles.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { sanitizeText } from '~/shared/utils/sanitize-text'

const responsibleInclude = {
  include: { user: { include: { member: { select: { firstname: true, lastname: true } } } } },
} as const

export function getTemplates(db: TransactionClient, congregationId: number) {
  return db.programmeTemplate.findMany({
    where: { congregationId },
    include: {
      _count: { select: { parts: true, serviceRoles: true, events: true } },
      responsibles: responsibleInclude,
    },
    orderBy: { name: 'asc' },
  })
}

export function getTemplateById(db: TransactionClient, templateId: number, congregationId: number) {
  return db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceRoles: { orderBy: { name: 'asc' } },
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
  const existing = await db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    select: { key: true },
  })
  const scoped = existing != null && isSystemTemplate(existing.key) ? { color: data.color } : data
  if (Object.values(scoped).every(v => v === undefined)) return null

  return db.programmeTemplate.update({
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
    allowedSpeakerRoleIds: number[]
    allowedReaderRoleIds: number[]
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
  }

  const part = partData.id
    ? await db.programmeTemplatePart.update({
        where: { id_congregationId: { id: partData.id, congregationId } },
        data: baseData,
      })
    : await db.programmeTemplatePart.create({
        data: { ...baseData, templateId, congregationId },
      })

  const speakerDiff = await setTemplatePartAllowedRoles(
    db,
    part.id,
    'speaker',
    partData.allowedSpeakerRoleIds,
    congregationId,
  )
  const readerDiff = await setTemplatePartAllowedRoles(
    db,
    part.id,
    'reader',
    partData.allowedReaderRoleIds,
    congregationId,
  )

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
      entityType: 'ProgrammeTemplatePart',
      entityId: part.id,
      metadata: { speaker: speakerDiff, reader: readerDiff },
    })
  }

  return part
}

export function deleteTemplatePart(db: TransactionClient, partId: number, congregationId: number) {
  return db.programmeTemplatePart.delete({
    where: {
      id_congregationId: { id: partId, congregationId },
    },
  })
}

export async function upsertTemplateServiceRole(
  db: TransactionClient,
  templateId: number,
  roleData: { id?: number; name: string; key: string; allowedRoleIds: number[] },
  congregationId: number,
  actorId: number,
) {
  const serviceRole = roleData.id
    ? await db.programmeTemplateServiceRole.update({
        where: { id_congregationId: { id: roleData.id, congregationId } },
        data: { name: roleData.name, key: roleData.key },
      })
    : await db.programmeTemplateServiceRole.create({
        data: { name: roleData.name, key: roleData.key, templateId, congregationId },
      })

  const diff = await setTemplateServiceRoleAllowedRoles(db, serviceRole.id, roleData.allowedRoleIds, congregationId)

  if (diff.added.length > 0 || diff.removed.length > 0) {
    audit({
      action: AuditAction.ServiceRoleAllowedRolesChanged,
      congregationId,
      actorId,
      entityType: 'ProgrammeTemplateServiceRole',
      entityId: serviceRole.id,
      metadata: { added: diff.added, removed: diff.removed },
    })
  }

  return serviceRole
}

export function deleteTemplateServiceRole(db: TransactionClient, roleId: number, congregationId: number) {
  return db.programmeTemplateServiceRole.delete({
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
    await db.programmeTemplatePart.update({
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
  return db.programmeTemplateResponsible.upsert({
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
  return db.programmeTemplateResponsible.deleteMany({
    where: { templateId, congregationId },
  })
}

export function isTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  userId: number,
  congregationId: number,
) {
  return db.programmeTemplateResponsible.findFirst({
    where: { templateId, userId, congregationId },
  })
}

export async function duplicateTemplate(db: TransactionClient, templateId: number, congregationId: number) {
  const source = await db.programmeTemplate.findFirst({
    where: { id: templateId, congregationId },
    include: {
      parts: {
        orderBy: { order: 'asc' },
        include: { allowedRoles: true },
      },
      serviceRoles: { include: { allowedRoles: true } },
    },
  })
  if (!source) return null

  // System templates are looked up by key at runtime — duplicating them just
  // clutters the list with an untethered `-copy-<ts>` row. The UI hides the
  // Duplicate button; this is the server-side match.
  if (isSystemTemplate(source.key)) return null

  const duplicated = await db.programmeTemplate.create({
    data: {
      name: `${source.name} (copie)`,
      key: `${source.key}-copy-${Date.now()}`,
      description: source.description,
      weekDay: source.weekDay,
      isRecurring: source.isRecurring,
      startTime: source.startTime,
      endTime: source.endTime,
      congregationId,
      parts: {
        create: source.parts.map(part => ({
          name: part.name,
          section: part.section,
          track: part.track,
          order: part.order,
          durationMin: part.durationMin,
          allowExternalSpeaker: part.allowExternalSpeaker,
          speakerLabel: part.speakerLabel,
          readerLabel: part.readerLabel,
          congregationId,
        })),
      },
      serviceRoles: {
        create: source.serviceRoles.map(role => ({
          name: role.name,
          key: `${role.key}-copy-${Date.now()}`,
          congregationId,
        })),
      },
    },
    include: {
      parts: { orderBy: { order: 'asc' } },
      serviceRoles: { orderBy: { name: 'asc' } },
    },
  })

  const sourcePartsByOrder = new Map(source.parts.map(p => [p.order, p]))
  const sourceServiceRolesByName = new Map(source.serviceRoles.map(r => [r.name, r]))

  for (const newPart of duplicated.parts) {
    const sourcePart = sourcePartsByOrder.get(newPart.order)
    if (!sourcePart) continue
    const speakerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'speaker').map(r => r.roleId)
    const readerRoleIds = sourcePart.allowedRoles.filter(r => r.asKind === 'reader').map(r => r.roleId)
    if (speakerRoleIds.length > 0) {
      await db.programmeTemplatePartAllowedRole.createMany({
        data: speakerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'speaker', congregationId })),
        skipDuplicates: true,
      })
    }
    if (readerRoleIds.length > 0) {
      await db.programmeTemplatePartAllowedRole.createMany({
        data: readerRoleIds.map(roleId => ({ partId: newPart.id, roleId, asKind: 'reader', congregationId })),
        skipDuplicates: true,
      })
    }
  }

  for (const newRole of duplicated.serviceRoles) {
    const sourceRole = sourceServiceRolesByName.get(newRole.name)
    if (!sourceRole || sourceRole.allowedRoles.length === 0) continue
    await db.programmeTemplateServiceRoleAllowedRole.createMany({
      data: sourceRole.allowedRoles.map(r => ({ serviceRoleId: newRole.id, roleId: r.roleId, congregationId })),
      skipDuplicates: true,
    })
  }

  return duplicated
}
