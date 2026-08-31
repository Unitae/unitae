import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-publishers')

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
    creditHours?: number | null
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
        // Optional: archives written before credits existed simply restore without one.
        creditHours: record.creditHours ?? null,
        notes: record.notes,
        congregationId,
      },
    })
    idMap.set('publisher-activities', record.id, created.id)
  }
}

export async function importPioneerEnrolments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    memberId: number
    type: string
    startMonth: number
    startYear: number
    endMonth: number | null
    endYear: number | null
    monthlyGoal: number | null
  }>(zip, 'pioneer-enrolments')

  let skipped = 0
  for (const record of records) {
    const memberId = idMap.getOptional('members', record.memberId)
    if (!memberId) {
      // The referenced member wasn't imported (e.g. a dropped placeholder account) — skip the stint
      // rather than orphan it, but count it so a silent data loss is visible in the logs.
      skipped++
      continue
    }

    // Imported verbatim — the stints already satisfied the aggregate's invariants when created.
    const created = await db.pioneerEnrolment.create({
      data: {
        memberId,
        type: record.type as PublisherType,
        startMonth: record.startMonth,
        startYear: record.startYear,
        endMonth: record.endMonth,
        endYear: record.endYear,
        monthlyGoal: record.monthlyGoal,
        congregationId,
      },
    })
    idMap.set('pioneer-enrolments', record.id, created.id)
  }

  if (skipped > 0) {
    logger.warn(`Skipped ${skipped} pioneer enrolment(s) whose member was not imported`, { congregationId, skipped })
  }
}

export async function importEmergencyContacts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    memberId: number
    name: string
    relationship: string
    phone: string
  }>(zip, 'emergency-contacts')

  for (const record of records) {
    const memberId = idMap.getOptional('members', record.memberId)
    if (!memberId) continue

    const created = await db.emergencyContact.create({
      data: {
        memberId,
        name: record.name,
        relationship: record.relationship,
        phone: record.phone,
        congregationId,
      },
    })
    idMap.set('emergency-contacts', record.id, created.id)
  }
}

export async function importPioneerGoals(zip: JsZip, db: TransactionClient, congregationId: number): Promise<void> {
  const records = await readNdjsonFile<{
    serviceYear: number
    type: string
    monthlyHours: number
  }>(zip, 'pioneer-goals')

  // No id remapping: the natural key is (serviceYear, type, congregationId).
  // Upsert so importing into a congregation that already has overrides refreshes
  // them instead of hitting the unique constraint.
  for (const record of records) {
    await db.pioneerGoal.upsert({
      where: {
        serviceYear_type_congregationId: {
          serviceYear: record.serviceYear,
          type: record.type as PublisherType,
          congregationId,
        },
      },
      create: {
        serviceYear: record.serviceYear,
        type: record.type as PublisherType,
        monthlyHours: record.monthlyHours,
        congregationId,
      },
      update: { monthlyHours: record.monthlyHours },
    })
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
