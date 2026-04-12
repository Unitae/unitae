import type { TransactionClient } from '~/shared/libs/db.server'

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
  data: { name?: string; weekDay?: number | null; isRecurring?: boolean; description?: string },
  congregationId: number,
) {
  return db.programmeTemplate.update({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
    order: number
    durationMin: number | null
    isVariable: boolean
  },
  congregationId: number,
) {
  if (partData.id) {
    return db.programmeTemplatePart.update({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: partData.id, congregationId },
      },
      data: {
        name: partData.name,
        section: partData.section,
        order: partData.order,
        durationMin: partData.durationMin,
        isVariable: partData.isVariable,
      },
    })
  }

  return db.programmeTemplatePart.create({
    data: {
      name: partData.name,
      section: partData.section,
      order: partData.order,
      durationMin: partData.durationMin,
      isVariable: partData.isVariable,
      templateId,
      congregationId,
    },
  })
}

export function deleteTemplatePart(db: TransactionClient, partId: number, congregationId: number) {
  return db.programmeTemplatePart.delete({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: roleId, congregationId },
    },
  })
}

export function setTemplateResponsible(
  db: TransactionClient,
  templateId: number,
  userId: number,
  congregationId: number,
) {
  return db.programmeTemplateResponsible.upsert({
    where: {
      // biome-ignore lint/style/useNamingConvention: prisma compound key
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
