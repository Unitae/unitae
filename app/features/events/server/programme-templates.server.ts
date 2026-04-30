import type { TransactionClient } from '~/shared/infra/db.server'

export function getTemplates(db: TransactionClient, congregationId: number) {
  return db.programmeTemplate.findMany({
    where: { congregationId },
    include: {
      _count: { select: { parts: true, serviceRoles: true, events: true } },
      responsibles: { include: { user: true } },
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
      responsibles: { include: { user: true } },
    },
  })
}

export function updateTemplate(
  db: TransactionClient,
  templateId: number,
  data: { name?: string; weekDay?: number | null; isRecurring?: boolean; description?: string; kindId?: number | null },
  congregationId: number,
) {
  return db.programmeTemplate.update({
    where: {
      id_congregationId: { id: templateId, congregationId },
    },
    data,
  })
}

export function upsertTemplatePart(
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
  },
  congregationId: number,
) {
  if (partData.id) {
    return db.programmeTemplatePart.update({
      where: {
        id_congregationId: { id: partData.id, congregationId },
      },
      data: {
        name: partData.name,
        section: partData.section,
        track: partData.track,
        trackOrder: partData.trackOrder,
        order: partData.order,
        durationMin: partData.durationMin,
        allowExternalSpeaker: partData.allowExternalSpeaker,
      },
    })
  }

  return db.programmeTemplatePart.create({
    data: {
      name: partData.name,
      section: partData.section,
      track: partData.track,
      trackOrder: partData.trackOrder,
      order: partData.order,
      durationMin: partData.durationMin,
      allowExternalSpeaker: partData.allowExternalSpeaker,
      templateId,
      congregationId,
    },
  })
}

export function deleteTemplatePart(db: TransactionClient, partId: number, congregationId: number) {
  return db.programmeTemplatePart.delete({
    where: {
      id_congregationId: { id: partId, congregationId },
    },
  })
}

export function upsertTemplateServiceRole(
  db: TransactionClient,
  templateId: number,
  roleData: { id?: number; name: string; key: string },
  congregationId: number,
) {
  if (roleData.id) {
    return db.programmeTemplateServiceRole.update({
      where: {
        id_congregationId: { id: roleData.id, congregationId },
      },
      data: {
        name: roleData.name,
        key: roleData.key,
      },
    })
  }

  return db.programmeTemplateServiceRole.create({
    data: {
      name: roleData.name,
      key: roleData.key,
      templateId,
      congregationId,
    },
  })
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
    include: { parts: { orderBy: { order: 'asc' } }, serviceRoles: true },
  })
  if (!source) return null

  return db.programmeTemplate.create({
    data: {
      name: `${source.name} (copie)`,
      key: `${source.key}-copy-${Date.now()}`,
      description: source.description,
      weekDay: source.weekDay,
      isRecurring: source.isRecurring,
      congregationId,
      parts: {
        create: source.parts.map(part => ({
          name: part.name,
          section: part.section,
          track: part.track,
          order: part.order,
          durationMin: part.durationMin,
          allowExternalSpeaker: part.allowExternalSpeaker,
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
  })
}
