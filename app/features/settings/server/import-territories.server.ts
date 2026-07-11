import type JsZip from 'jszip'
import type { TerritoryAttributionKind, TerritoryKind } from '~/features/territories'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

export async function importTerritories(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ id: number; number: string; type: string; notes: string }>(zip, 'territories')
  for (const record of records) {
    const existing = await db.territory.findFirst({ where: { number: record.number } })
    if (existing) {
      await db.territory.update({
        where: { id: existing.id },
        data: { type: record.type as TerritoryKind, notes: record.notes },
      })
      idMap.set('territories', record.id, existing.id)
    } else {
      const created = await db.territory.create({
        data: { number: record.number, type: record.type as TerritoryKind, notes: record.notes, congregationId },
      })
      idMap.set('territories', record.id, created.id)
    }
  }
}

export async function importTerritoryCardOverlays(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string | null
    color: string
    paths: unknown
  }>(zip, 'territory-card-overlays')

  for (const record of records) {
    const created = await db.territoryCardOverlay.create({
      data: {
        name: record.name,
        color: record.color,
        paths: record.paths as never,
        congregationId,
      },
    })
    idMap.set('territory-card-overlays', record.id, created.id)
  }
}

export async function importTerritoryPerimeter(
  zip: JsZip,
  db: TransactionClient,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ paths: unknown }>(zip, 'territory-perimeter')
  const record = records[0]
  if (!record) return

  await db.territoryPerimeter.upsert({
    where: { congregationId },
    update: { paths: record.paths as never },
    create: { paths: record.paths as never, congregationId },
  })
}

export async function importAttributions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    type: string
    publisherId: number
    territoryId: number
    startDate: string
    endDate: string | null
    lateDate: string
    notes: string
  }>(zip, 'attributions')

  for (const record of records) {
    const publisherId = idMap.getOptional('members', record.publisherId)
    const territoryId = idMap.getOptional('territories', record.territoryId)
    if (!publisherId || !territoryId) continue

    const created = await db.attribution.create({
      data: {
        type: record.type as TerritoryAttributionKind,
        publisherId,
        territoryId,
        startDate: new Date(record.startDate),
        endDate: record.endDate ? new Date(record.endDate) : null,
        lateDate: new Date(record.lateDate),
        notes: record.notes,
        congregationId,
      },
    })
    idMap.set('attributions', record.id, created.id)
  }
}
