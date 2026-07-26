import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importPublisherGroups(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    adress: string
    responsibleId: number
    deputyId: number | null
  }>(zip, 'publisher-groups')

  for (const record of records) {
    const responsibleId = idMap.getOptional('members', record.responsibleId)
    if (!responsibleId) continue // cannot create group without responsible

    const deputyId = idMap.getOptional('members', record.deputyId)

    const created = await db.publisherGroup.create({
      data: {
        name: record.name,
        adress: record.adress,
        responsibleId,
        deputyId,
        congregationId,
      },
    })
    idMap.set('publisher-groups', record.id, created.id)
  }
}

export async function updateMemberPublisherGroups(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedMember {
    id: number
    publisherGroupId: number | null
  }

  const records = await readNdjsonFile<ExportedMember>(zip, 'members')
  for (const record of records) {
    if (record.publisherGroupId == null) continue
    const memberId = idMap.getOptional('members', record.id)
    const groupId = idMap.getOptional('publisher-groups', record.publisherGroupId)
    if (!memberId || !groupId) continue

    await db.member.update({
      where: { id_congregationId: { id: memberId, congregationId } },
      data: { publisherGroupId: groupId },
    })
  }
}

export async function importPublisherActivities(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    month: number
    year: number
    publisherId: number
    hours: number | null
    studies: number
    type: string
    isPublisher: boolean
    notes: string
  }>(zip, 'publisher-activities')

  for (const record of records) {
    const publisherId = idMap.getOptional('members', record.publisherId)
    if (!publisherId) continue

    const created = await db.publisherActivity.create({
      data: {
        month: record.month,
        year: record.year,
        publisherId,
        hours: record.hours,
        studies: record.studies,
        type: record.type as PublisherType,
        isPublisher: record.isPublisher,
        notes: record.notes,
        congregationId,
      },
    })
    idMap.set('publisher-activities', record.id, created.id)
  }
}

export async function importExternalSpeakers(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    congregationName: string
    phone: string | null
    email: string | null
    notes: string | null
    archivedAt: string | null
  }>(zip, 'external-speakers')

  for (const record of records) {
    const created = await db.externalSpeaker.create({
      data: {
        name: record.name,
        congregationName: record.congregationName,
        phone: record.phone,
        email: record.email,
        notes: record.notes,
        archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        congregationId,
      },
    })
    idMap.set('external-speakers', record.id, created.id)
  }
}
