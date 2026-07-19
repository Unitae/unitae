import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importProgrammeTemplates(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    key: string
    description: string
    weekDay: number | null
    isRecurring: boolean
    color?: string
  }>(zip, 'programme-templates')

  for (const record of records) {
    const existing = await db.programmeTemplate.findFirst({ where: { key: record.key } })
    if (existing) {
      await db.programmeTemplate.update({
        where: { id: existing.id },
        data: {
          name: record.name,
          description: record.description,
          weekDay: record.weekDay,
          isRecurring: record.isRecurring,
          ...(record.color != null ? { color: record.color } : {}),
        },
      })
      idMap.set('programme-templates', record.id, existing.id)
    } else {
      const created = await db.programmeTemplate.create({
        data: {
          name: record.name,
          key: record.key,
          description: record.description,
          weekDay: record.weekDay,
          isRecurring: record.isRecurring,
          ...(record.color != null ? { color: record.color } : {}),
          congregationId,
        },
      })
      idMap.set('programme-templates', record.id, created.id)
    }
  }
}

export async function importProgrammeTemplateParts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    section: string
    track: string
    trackOrder?: number | null
    order: number
    durationMin: number | null
    allowExternalSpeaker: boolean
    templateId: number
  }>(zip, 'programme-template-parts')

  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    if (!templateId) continue

    const created = await db.programmeTemplatePart.create({
      data: {
        name: record.name,
        section: record.section,
        track: record.track,
        trackOrder: record.trackOrder ?? null,
        order: record.order,
        durationMin: record.durationMin,
        allowExternalSpeaker: record.allowExternalSpeaker,
        templateId,
        congregationId,
      },
    })
    idMap.set('programme-template-parts', record.id, created.id)
  }
}

export async function importProgrammeTemplateServiceRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    key: string
    templateId: number
  }>(zip, 'programme-template-service-roles')

  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    if (!templateId) continue

    const created = await db.programmeTemplateServiceRole.create({
      data: {
        name: record.name,
        key: record.key,
        templateId,
        congregationId,
      },
    })
    idMap.set('programme-template-service-roles', record.id, created.id)
  }
}

export async function importProgrammeTemplateResponsibles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ id: number; templateId: number; userId: number }>(
    zip,
    'programme-template-responsibles',
  )

  for (const record of records) {
    const templateId = idMap.getOptional('programme-templates', record.templateId)
    const userId = idMap.getOptional('user-accounts', record.userId)
    if (!templateId || !userId) continue

    await db.programmeTemplateResponsible.create({
      data: { templateId, userId, congregationId },
    })
  }
}

export async function importProgrammeTemplatePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ partId: number; roleId: number; asKind: string }>(
    zip,
    'programme-template-part-allowed-roles',
  )
  const data: { partId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const partId = idMap.getOptional('programme-template-parts', record.partId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!partId || !roleId) continue
    data.push({ partId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.programmeTemplatePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importProgrammeTemplateServiceRoleAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ serviceRoleId: number; roleId: number }>(
    zip,
    'programme-template-service-role-allowed-roles',
  )
  const data: { serviceRoleId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const serviceRoleId = idMap.getOptional('programme-template-service-roles', record.serviceRoleId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!serviceRoleId || !roleId) continue
    data.push({ serviceRoleId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.programmeTemplateServiceRoleAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
