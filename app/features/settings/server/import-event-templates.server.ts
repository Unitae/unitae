import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importEventTemplates(
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
    const existing = await db.eventTemplate.findFirst({ where: { key: record.key, congregationId } })
    if (existing) {
      await db.eventTemplate.update({
        where: { id_congregationId: { id: existing.id, congregationId } },
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
      const created = await db.eventTemplate.create({
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

export async function importTemplateParts(
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

    const created = await db.templatePart.create({
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

export async function importTemplateServiceParts(
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

    const created = await db.templateServicePart.create({
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

export async function importTemplateResponsibles(
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

    await db.templateResponsible.create({
      data: { templateId, userId, congregationId },
    })
  }
}

export async function importTemplatePartAllowedRoles(
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
    await db.templatePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importTemplateServicePartAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ servicePartId: number; roleId: number }>(
    zip,
    'programme-template-service-role-allowed-roles',
  )
  const data: { servicePartId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const servicePartId = idMap.getOptional('programme-template-service-roles', record.servicePartId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!servicePartId || !roleId) continue
    data.push({ servicePartId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.templateServicePartAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
