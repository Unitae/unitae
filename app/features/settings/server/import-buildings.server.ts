import type JsZip from 'jszip'
import type { EntranceKind } from '~/features/territories'
import type { TransactionClient } from '~/shared/infra/db.server'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importBuildings(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    number: string
    street: string
    zip: string
    latitude: number | null
    longitude: number | null
    active: boolean
    inTerritory: boolean
    inOpenData: boolean
    prospectionDate: string | null
    notes: string
    importantNotes: string
  }>(zip, 'buildings')

  for (const record of records) {
    const existing = await db.building.findFirst({
      where: { number: record.number, street: record.street, zip: record.zip, congregationId },
    })

    const data = {
      // Refresh `streetNormalized` on both create and update so legacy rows
      // that pre-date the normalized column get backfilled when re-imported.
      streetNormalized: stripDiacritics(record.street),
      latitude: record.latitude,
      longitude: record.longitude,
      active: record.active,
      inTerritory: record.inTerritory,
      inOpenData: record.inOpenData,
      prospectionDate: record.prospectionDate ? new Date(record.prospectionDate) : null,
      notes: record.notes,
      importantNotes: record.importantNotes,
    }

    if (existing) {
      await db.building.update({ where: { id_congregationId: { id: existing.id, congregationId } }, data })
      idMap.set('buildings', record.id, existing.id)
    } else {
      const created = await db.building.create({
        data: {
          number: record.number,
          street: record.street,
          zip: record.zip,
          ...data,
          congregationId,
        },
      })
      idMap.set('buildings', record.id, created.id)
    }
  }
}

export async function importBuildingEntrances(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    kind: string
    shopKind: string
    homes: number | null
    phones: number | null
    liberals: number | null
    access: number | null
    isPMR: boolean | null
    isOpenEarly: boolean | null
    isMailboxOpen: boolean | null
    notes: string
  }>(zip, 'building-entrances')

  for (const record of records) {
    const created = await db.buildingEntrance.create({
      data: {
        kind: record.kind as EntranceKind,
        shopKind: record.shopKind,
        homes: record.homes,
        phones: record.phones,
        liberals: record.liberals,
        access: record.access,
        isPMR: record.isPMR,
        isOpenEarly: record.isOpenEarly,
        isMailboxOpen: record.isMailboxOpen,
        notes: record.notes,
        congregationId,
      },
    })
    idMap.set('building-entrances', record.id, created.id)
  }
}

export async function importBuildingAccesses(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ id: number; entranceId: number; type: number; position: number }>(
    zip,
    'building-accesses',
  )
  for (const record of records) {
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!entranceId) continue

    const created = await db.buildingAccess.create({
      data: { entranceId, type: record.type, position: record.position, congregationId },
    })
    idMap.set('building-accesses', record.id, created.id)
  }
}

export async function importBuildingResidentialData(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    buildingId: number
    entranceId: number
    homes: number | null
    phones: number | null
    liberals: number | null
  }>(zip, 'building-residential-data')

  for (const record of records) {
    const buildingId = idMap.getOptional('buildings', record.buildingId)
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!buildingId || !entranceId) continue

    await db.buildingResidentialData.upsert({
      where: { buildingId },
      update: { entranceId, homes: record.homes, phones: record.phones, liberals: record.liberals },
      create: {
        buildingId,
        entranceId,
        homes: record.homes,
        phones: record.phones,
        liberals: record.liberals,
        congregationId,
      },
    })
  }
}

export async function importTerritoryEntranceLinks(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ territoryId: number; entranceId: number }>(zip, 'territory-entrance-links')
  for (const record of records) {
    const territoryId = idMap.getOptional('territories', record.territoryId)
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!territoryId || !entranceId) continue

    await db.territory.update({
      where: { id_congregationId: { id: territoryId, congregationId } },
      data: { entrances: { connect: { id: entranceId } } },
    })
  }
}

export async function importBuildingEntranceLinks(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ buildingId: number; entranceId: number }>(zip, 'building-entrance-links')
  for (const record of records) {
    const buildingId = idMap.getOptional('buildings', record.buildingId)
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!buildingId || !entranceId) continue

    await db.building.update({
      where: { id_congregationId: { id: buildingId, congregationId } },
      data: { entrances: { connect: { id: entranceId } } },
    })
  }
}
