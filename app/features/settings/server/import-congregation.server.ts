import type { Job } from 'bullmq'
import JsZip from 'jszip'
import type { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import type { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { type TransactionClient, unscopedDb, withScope } from '~/shared/infra/db.server'
import { buildStorageKey, getFileBuffer, uploadFile } from '~/shared/infra/file-storage.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import {
  ARCHIVE_VERSION,
  EntityIdMap,
  type ImportConflict,
  type ImportSummary,
  type ManifestJson,
} from './data-transfer.type'
import type { DataTransferJobData } from './data-transfer-queue.server'

const logger = createLogger('import-congregation')

type ImportJobData = Extract<DataTransferJobData, { type: 'import' }>

// Password that can never match any valid scrypt hash
const IMPORTED_PASSWORD_PLACEHOLDER = '$IMPORTED$'

/**
 * Validates a .unitae archive without writing any data.
 * Returns a summary of what would be imported and any conflicts.
 */
export async function validateImport(storageKey: string, congregationId: number): Promise<ImportSummary> {
  const buffer = await getFileBuffer(storageKey)
  if (!buffer) {
    throw new Error('Archive file not found')
  }

  const zip = await JsZip.loadAsync(buffer)
  const manifest = await readManifest(zip)

  if (manifest.version !== ARCHIVE_VERSION) {
    return {
      entityCounts: manifest.entityCounts,
      conflicts: [],
      warnings: [`Version de l'archive non supportée : ${manifest.version} (attendue : ${ARCHIVE_VERSION})`],
    }
  }

  const conflicts: ImportConflict[] = []
  const warnings: string[] = [
    'Les mots de passe ne sont pas importés. Les utilisateurs devront réinitialiser leur mot de passe.',
  ]

  // Check user email conflicts
  const usersNdjson = await readNdjsonFile<{ email: string }>(zip, 'users')
  if (usersNdjson.length > 0) {
    const importedEmails = usersNdjson.map(u => u.email)
    const existingUsers = await unscopedDb.user.findMany({
      where: { email: { in: importedEmails } },
      select: { id: true, email: true, congregationId: true },
    })
    for (const existing of existingUsers) {
      if (existing.congregationId === congregationId) {
        conflicts.push({
          entityType: 'users',
          naturalKey: { email: existing.email },
          existingId: existing.id,
          action: 'update',
        })
      } else {
        conflicts.push({
          entityType: 'users',
          naturalKey: { email: existing.email },
          existingId: existing.id,
          action: 'skip',
        })
        warnings.push(`L'utilisateur ${existing.email} existe déjà dans une autre congrégation et sera ignoré.`)
      }
    }
  }

  // Check territory number conflicts
  await withScope(congregationId, async db => {
    const territoriesNdjson = await readNdjsonFile<{ number: string }>(zip, 'territories')
    if (territoriesNdjson.length > 0) {
      const importedNumbers = territoriesNdjson.map(t => t.number)
      const existingTerritories = await db.territory.findMany({
        where: { number: { in: importedNumbers } },
        select: { id: true, number: true },
      })
      for (const existing of existingTerritories) {
        conflicts.push({
          entityType: 'territories',
          naturalKey: { number: existing.number },
          existingId: existing.id,
          action: 'update',
        })
      }
    }

    // Check event kind key conflicts
    const eventKindsNdjson = await readNdjsonFile<{ key: string }>(zip, 'event-kinds')
    if (eventKindsNdjson.length > 0) {
      const importedKeys = eventKindsNdjson.map(e => e.key)
      const existingKinds = await db.eventKind.findMany({
        where: { key: { in: importedKeys } },
        select: { id: true, key: true },
      })
      for (const existing of existingKinds) {
        conflicts.push({
          entityType: 'event-kinds',
          naturalKey: { key: existing.key },
          existingId: existing.id,
          action: 'update',
        })
      }
    }

    // Check setting key conflicts
    const settingsNdjson = await readNdjsonFile<{ key: string }>(zip, 'settings')
    if (settingsNdjson.length > 0) {
      const importedKeys = settingsNdjson.map(s => s.key)
      const existingSettings = await db.setting.findMany({
        where: { key: { in: importedKeys } },
        select: { id: true, key: true },
      })
      for (const existing of existingSettings) {
        conflicts.push({
          entityType: 'settings',
          naturalKey: { key: existing.key },
          existingId: existing.id,
          action: 'update',
        })
      }
    }
  })

  return { entityCounts: manifest.entityCounts, conflicts, warnings }
}

/**
 * Runs a full congregation import as a background job.
 */
export async function runImport(job: Job<ImportJobData>): Promise<void> {
  const { congregationId, userId, storageKey } = job.data
  await job.updateProgress(0)

  const buffer = await getFileBuffer(storageKey)
  if (!buffer) {
    throw new Error('Archive file not found')
  }

  const zip = await JsZip.loadAsync(buffer)
  await readManifest(zip) // validate

  const idMap = new EntityIdMap()

  // Resolve global Permission keys -> ids upfront (these are shared, not per-congregation)
  const allPermissions = await unscopedDb.permission.findMany({ select: { id: true, key: true } })
  const permissionKeyToId = new Map(allPermissions.map(p => [p.key, p.id]))

  await withScope(congregationId, async db => {
    const totalSteps = 27
    let step = 0

    const progress = async () => {
      step++
      await job.updateProgress(Math.round((step / totalSteps) * 95))
    }

    // 1. Settings (upsert by key)
    await importSettings(zip, db, congregationId)
    await progress()

    // 2. Event kinds (upsert by key)
    await importEventKinds(zip, db, idMap, congregationId)
    await progress()

    // 3. Users (upsert by email within same congregation, skip if in different congregation)
    await importUsers(zip, db, idMap, congregationId)
    await progress()

    // 4. Congregation user roles
    await importCongregationUserPermissions(zip, db, idMap, permissionKeyToId, congregationId)
    await progress()

    // 5. Publisher groups (depends on users)
    await importPublisherGroups(zip, db, idMap, congregationId)
    await progress()

    // 6. Update user publisherGroupId (depends on groups)
    await updateUserPublisherGroups(zip, db, idMap)
    await progress()

    // 7. Publisher activities (depends on users)
    await importPublisherActivities(zip, db, idMap, congregationId)
    await progress()

    // 8. Territories (upsert by number)
    await importTerritories(zip, db, idMap, congregationId)
    await progress()

    // 9. Buildings (upsert by number+street+zip)
    await importBuildings(zip, db, idMap, congregationId)
    await progress()

    // 10. Building entrances
    await importBuildingEntrances(zip, db, idMap, congregationId)
    await progress()

    // 11. Building accesses (depends on entrances)
    await importBuildingAccesses(zip, db, idMap, congregationId)
    await progress()

    // 12. Building residential data (depends on buildings + entrances)
    await importBuildingResidentialData(zip, db, idMap, congregationId)
    await progress()

    // 13. Territory-entrance links
    await importTerritoryEntranceLinks(zip, db, idMap)
    await progress()

    // 14. Building-entrance links
    await importBuildingEntranceLinks(zip, db, idMap)
    await progress()

    // 15. Attributions (depends on users + territories)
    await importAttributions(zip, db, idMap, congregationId)
    await progress()

    // 16. Programme templates (upsert by key)
    await importProgrammeTemplates(zip, db, idMap, congregationId)
    await progress()

    // 17. Programme template parts
    await importProgrammeTemplateParts(zip, db, idMap, congregationId)
    await progress()

    // 18. Programme template service roles
    await importProgrammeTemplateServiceRoles(zip, db, idMap, congregationId)
    await progress()

    // 19. Programme template responsibles
    await importProgrammeTemplateResponsibles(zip, db, idMap, congregationId)
    await progress()

    // 20. Events (depends on event kinds + templates + users)
    await importEvents(zip, db, idMap, congregationId)
    await progress()

    // 21. Programme part assignments
    await importProgrammePartAssignments(zip, db, idMap, congregationId)
    await progress()

    // 22. Programme service role assignments
    await importProgrammeServiceRoleAssignments(zip, db, idMap, congregationId)
    await progress()

    // 23. Board sections
    await importBoardSections(zip, db, idMap, congregationId)
    await progress()

    // 24. Board documents (+ files)
    await importBoardDocuments(zip, db, idMap, congregationId)
    await progress()

    // 25. Board document versions (+ files)
    await importBoardDocumentVersions(zip, db, idMap, congregationId)
    await progress()

    // 26. Board dynamic document settings
    await importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
    await progress()

    // 27. Consent records
    await importConsentRecords(zip, db, idMap, congregationId)
    await progress()

    // Optional: audit logs
    await importAuditLogs(zip, db, idMap, congregationId)

    // Optional: data deletion records
    await importDataDeletionRecords(zip, db, congregationId)
  })

  await job.updateProgress(100)

  audit({
    action: AuditAction.CongregationImported,
    congregationId,
    actorId: userId,
    entityType: 'Congregation',
    entityId: congregationId,
    metadata: { storageKey },
  })

  logger.info(`Import completed for congregation ${congregationId}`)
}

// --- Helpers ---

async function readManifest(zip: JsZip): Promise<ManifestJson> {
  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) {
    throw new Error('Invalid archive: missing manifest.json')
  }
  return JSON.parse(await manifestFile.async('string')) as ManifestJson
}

async function readNdjsonFile<T>(zip: JsZip, name: string): Promise<T[]> {
  const file = zip.file(`data/${name}.ndjson`)
  if (!file) return []
  const content = await file.async('string')
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T)
}

// --- Import functions per entity (exported for integration testing) ---

export async function importSettings(zip: JsZip, db: TransactionClient, congregationId: number): Promise<void> {
  const records = await readNdjsonFile<{ key: string; value: string }>(zip, 'settings')
  for (const record of records) {
    await db.setting.upsert({
      where: { key_congregationId: { key: record.key, congregationId } },
      update: { value: record.value },
      create: { key: record.key, value: record.value, congregationId },
    })
  }
}

export async function importEventKinds(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    key: string
    color: string
    weekDay: number | null
  }>(zip, 'event-kinds')
  for (const record of records) {
    const existing = await db.eventKind.findFirst({ where: { key: record.key } })
    if (existing) {
      await db.eventKind.update({
        where: { id: existing.id },
        data: { name: record.name, color: record.color, weekDay: record.weekDay },
      })
      idMap.set('event-kinds', record.id, existing.id)
    } else {
      const created = await db.eventKind.create({
        data: {
          name: record.name,
          key: record.key,
          color: record.color,
          weekDay: record.weekDay,
          congregationId,
        },
      })
      idMap.set('event-kinds', record.id, created.id)
    }
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex import logic with many entity types and validation steps
export async function importUsers(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedUser {
    id: number
    firstname: string | null
    lastname: string | null
    email: string
    active: boolean
    isPublisher: boolean
    type: string
    isMale: boolean | null
    phone: string | null
    address: string | null
    birthDate: string | null
    baptismDate: string | null
    isHelder: boolean
    isServant: boolean
    isAnointed: boolean
    anonymizedAt: string | null
    publisherGroupId: number | null
    createdAt: string
    updatedAt: string
  }

  const records = await readNdjsonFile<ExportedUser>(zip, 'users')
  for (const record of records) {
    // Check if user exists globally (email is unique across all congregations)
    const existing = await db.user.findFirst({ where: { email: record.email } })

    if (existing) {
      // Only update if the user belongs to this congregation
      if (existing.congregationId === congregationId) {
        await db.user.update({
          where: { id: existing.id },
          data: {
            firstname: record.firstname,
            lastname: record.lastname,
            active: record.active,
            isPublisher: record.isPublisher,
            type: record.type as PublisherType,
            isMale: record.isMale,
            phone: record.phone,
            address: record.address,
            birthDate: record.birthDate ? new Date(record.birthDate) : null,
            baptismDate: record.baptismDate ? new Date(record.baptismDate) : null,
            isHelder: record.isHelder,
            isServant: record.isServant,
            isAnointed: record.isAnointed,
          },
        })
        idMap.set('users', record.id, existing.id)
        await syncBuiltInRoleAssignments(db, existing.id, congregationId, null)
      } else {
        // User exists in different congregation — skip
        logger.warn(`Skipping user ${record.email}: exists in another congregation`, { congregationId })
      }
    } else {
      const created = await db.user.create({
        data: {
          firstname: record.firstname,
          lastname: record.lastname,
          email: record.email,
          password: IMPORTED_PASSWORD_PLACEHOLDER,
          active: record.active,
          platformAdmin: false,
          isPublisher: record.isPublisher,
          type: record.type as PublisherType,
          isMale: record.isMale,
          phone: record.phone,
          address: record.address,
          birthDate: record.birthDate ? new Date(record.birthDate) : null,
          baptismDate: record.baptismDate ? new Date(record.baptismDate) : null,
          isHelder: record.isHelder,
          isServant: record.isServant,
          isAnointed: record.isAnointed,
          anonymizedAt: record.anonymizedAt ? new Date(record.anonymizedAt) : null,
          congregationId,
        },
      })
      idMap.set('users', record.id, created.id)
      await syncBuiltInRoleAssignments(db, created.id, congregationId, null)
    }
  }
}

export async function importCongregationUserPermissions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  permissionKeyToId: Map<string, number>,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ userId: number; permissionKey: string }>(zip, 'congregation-user-permissions')
  for (const record of records) {
    const userId = idMap.getOptional('users', record.userId)
    const permissionId = permissionKeyToId.get(record.permissionKey)
    if (!userId || !permissionId) continue

    const existing = await db.congregationUserPermission.findFirst({
      where: { userId, permissionId },
    })
    if (!existing) {
      await db.congregationUserPermission.create({
        data: { userId, permissionId, congregationId },
      })
    }
  }
}

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
    const responsibleId = idMap.getOptional('users', record.responsibleId)
    if (!responsibleId) continue // cannot create group without responsible

    const deputyId = idMap.getOptional('users', record.deputyId)

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

export async function updateUserPublisherGroups(zip: JsZip, db: TransactionClient, idMap: EntityIdMap): Promise<void> {
  interface ExportedUser {
    id: number
    publisherGroupId: number | null
  }

  const records = await readNdjsonFile<ExportedUser>(zip, 'users')
  for (const record of records) {
    if (record.publisherGroupId == null) continue
    const userId = idMap.getOptional('users', record.id)
    const groupId = idMap.getOptional('publisher-groups', record.publisherGroupId)
    if (!userId || !groupId) continue

    await db.user.update({
      where: { id: userId },
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
    const publisherId = idMap.getOptional('users', record.publisherId)
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
      where: { number: record.number, street: record.street, zip: record.zip },
    })

    const data = {
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
      await db.building.update({ where: { id: existing.id }, data })
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
): Promise<void> {
  const records = await readNdjsonFile<{ territoryId: number; entranceId: number }>(zip, 'territory-entrance-links')
  for (const record of records) {
    const territoryId = idMap.getOptional('territories', record.territoryId)
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!territoryId || !entranceId) continue

    await db.territory.update({
      where: { id: territoryId },
      data: { entrances: { connect: { id: entranceId } } },
    })
  }
}

export async function importBuildingEntranceLinks(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
): Promise<void> {
  const records = await readNdjsonFile<{ buildingId: number; entranceId: number }>(zip, 'building-entrance-links')
  for (const record of records) {
    const buildingId = idMap.getOptional('buildings', record.buildingId)
    const entranceId = idMap.getOptional('building-entrances', record.entranceId)
    if (!buildingId || !entranceId) continue

    await db.building.update({
      where: { id: buildingId },
      data: { entrances: { connect: { id: entranceId } } },
    })
  }
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
    const publisherId = idMap.getOptional('users', record.publisherId)
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
    const userId = idMap.getOptional('users', record.userId)
    if (!templateId || !userId) continue

    await db.programmeTemplateResponsible.create({
      data: { templateId, userId, congregationId },
    })
  }
}

export async function importEvents(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    name: string
    description: string
    kindId: number | null
    startDate: string
    endDate: string
    templateId: number | null
    createdById: number
    createdAt: string
  }>(zip, 'events')

  for (const record of records) {
    const createdById = idMap.getOptional('users', record.createdById)
    if (!createdById) continue

    const kindId = idMap.getOptional('event-kinds', record.kindId)
    const templateId = idMap.getOptional('programme-templates', record.templateId)

    const created = await db.event.create({
      data: {
        name: record.name,
        description: record.description,
        kindId,
        startDate: new Date(record.startDate),
        endDate: new Date(record.endDate),
        templateId,
        createdById,
        congregationId,
      },
    })
    idMap.set('events', record.id, created.id)
  }
}

export async function importProgrammePartAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    topic: string
    note: string
    hasConflict: boolean
    name: string
    section: string
    track: string
    order: number
    durationMin: number | null
    eventId: number
    partId: number | null
    assigneeId: number | null
    assistantId: number | null
  }>(zip, 'programme-part-assignments')

  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    const created = await db.programmePartAssignment.create({
      data: {
        topic: record.topic,
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        section: record.section,
        track: record.track,
        order: record.order,
        durationMin: record.durationMin,
        eventId,
        partId: idMap.getOptional('programme-template-parts', record.partId),
        assigneeId: idMap.getOptional('users', record.assigneeId),
        assistantId: idMap.getOptional('users', record.assistantId),
        congregationId,
      },
    })
    idMap.set('programme-part-assignments', record.id, created.id)
  }
}

export async function importProgrammeServiceRoleAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    note: string
    hasConflict: boolean
    name: string
    eventId: number
    serviceRoleId: number | null
    assigneeId: number | null
  }>(zip, 'programme-service-role-assignments')

  for (const record of records) {
    const eventId = idMap.getOptional('events', record.eventId)
    if (!eventId) continue

    await db.programmeServiceRoleAssignment.create({
      data: {
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        eventId,
        serviceRoleId: idMap.getOptional('programme-template-service-roles', record.serviceRoleId),
        assigneeId: idMap.getOptional('users', record.assigneeId),
        congregationId,
      },
    })
  }
}

export async function importBoardSections(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ id: number; name: string; order: number | null }>(zip, 'board-sections')
  for (const record of records) {
    const created = await db.boardSection.create({
      data: { name: record.name, order: record.order, congregationId },
    })
    idMap.set('board-sections', record.id, created.id)
  }
}

export async function importBoardDocuments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    title: string
    uri: string | null
    thumbnailUri: string | null
    sectionId: number
    order: number | null
    type: string | null
    visibleFrom: string | null
    visibleUntil: string | null
    isHighlighted: boolean
    createdAt: string
  }>(zip, 'board-documents')

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    if (!sectionId) continue

    // Import associated files if present
    let newUri = record.uri
    let newThumbnailUri = record.thumbnailUri
    if (record.uri) {
      newUri = await importBoardFile(zip, record.uri, congregationId)
    }
    if (record.thumbnailUri) {
      newThumbnailUri = await importBoardFile(zip, record.thumbnailUri, congregationId)
    }

    const created = await db.boardDocument.create({
      data: {
        title: record.title,
        uri: newUri,
        thumbnailUri: newThumbnailUri,
        sectionId,
        order: record.order,
        type: record.type,
        visibleFrom: record.visibleFrom ? new Date(record.visibleFrom) : null,
        visibleUntil: record.visibleUntil ? new Date(record.visibleUntil) : null,
        isHighlighted: record.isHighlighted,
        congregationId,
      },
    })
    idMap.set('board-documents', record.id, created.id)
  }
}

export async function importBoardDocumentVersions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    documentId: number
    uri: string
    thumbnailUri: string | null
    versionNumber: number
    uploadedById: number | null
    createdAt: string
  }>(zip, 'board-document-versions')

  for (const record of records) {
    const documentId = idMap.getOptional('board-documents', record.documentId)
    if (!documentId) continue

    let newUri = record.uri
    let newThumbnailUri = record.thumbnailUri
    newUri = (await importBoardFile(zip, record.uri, congregationId)) ?? record.uri
    if (record.thumbnailUri) {
      newThumbnailUri = await importBoardFile(zip, record.thumbnailUri, congregationId)
    }

    await db.boardDocumentVersion.create({
      data: {
        documentId,
        uri: newUri,
        thumbnailUri: newThumbnailUri,
        versionNumber: record.versionNumber,
        uploadedById: idMap.getOptional('users', record.uploadedById),
        congregationId,
      },
    })
  }
}

/**
 * Imports a board file from the ZIP archive to storage.
 * Returns the new storage key, or null if the file is not in the archive.
 */
export async function importBoardFile(zip: JsZip, originalUri: string, congregationId: number): Promise<string | null> {
  const filename = originalUri.split('/').pop()
  if (!filename) return null

  const zipFile = zip.file(`files/board/${filename}`)
  if (!zipFile) return null

  const buffer = await zipFile.async('nodebuffer')
  const contentType = filename.endsWith('.png') ? 'image/png' : 'application/pdf'
  const newKey = buildStorageKey(congregationId, 'board', filename)
  await uploadFile(newKey, buffer, contentType)
  return newKey
}

export async function importBoardDynamicDocumentSettings(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    title: string
    dynamicType: string
    dynamicRef: string | null
    sectionId: number
    order: number | null
    visibleFrom: string | null
    visibleUntil: string | null
    isHighlighted: boolean
    showServices: boolean
  }>(zip, 'board-dynamic-document-settings')

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    if (!sectionId) continue

    // Upsert by (congregationId, dynamicType, dynamicRef)
    const existing = await db.boardDynamicDocumentSettings.findFirst({
      where: { dynamicType: record.dynamicType, dynamicRef: record.dynamicRef },
    })

    const data = {
      title: record.title,
      sectionId,
      order: record.order,
      visibleFrom: record.visibleFrom ? new Date(record.visibleFrom) : null,
      visibleUntil: record.visibleUntil ? new Date(record.visibleUntil) : null,
      isHighlighted: record.isHighlighted,
      showServices: record.showServices,
    }

    if (existing) {
      await db.boardDynamicDocumentSettings.update({ where: { id: existing.id }, data })
      idMap.set('board-dynamic-document-settings', record.id, existing.id)
    } else {
      const created = await db.boardDynamicDocumentSettings.create({
        data: {
          ...data,
          dynamicType: record.dynamicType,
          dynamicRef: record.dynamicRef,
          congregationId,
        },
      })
      idMap.set('board-dynamic-document-settings', record.id, created.id)
    }
  }
}

export async function importConsentRecords(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    purpose: string
    consentedAt: string
    withdrawnAt: string | null
    consentVersion: string
    ipAddress: string | null
    userId: number
  }>(zip, 'consent-records')

  for (const record of records) {
    const userId = idMap.getOptional('users', record.userId)
    if (!userId) continue

    await db.consentRecord.create({
      data: {
        purpose: record.purpose,
        consentedAt: new Date(record.consentedAt),
        withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : null,
        consentVersion: record.consentVersion,
        ipAddress: record.ipAddress,
        userId,
        congregationId,
      },
    })
  }
}

export async function importAuditLogs(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    action: string
    entityType: string | null
    entityId: number | null
    actorId: number | null
    actorEmail: string | null
    metadata: string | null
    createdAt: string
  }>(zip, 'audit-logs')

  for (const record of records) {
    await db.auditLog.create({
      data: {
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        actorId: idMap.getOptional('users', record.actorId),
        actorEmail: record.actorEmail,
        metadata: record.metadata,
        createdAt: new Date(record.createdAt),
        congregationId,
      },
    })
  }
}

export async function importDataDeletionRecords(
  zip: JsZip,
  db: TransactionClient,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    entityType: string
    entityId: number
    requestedBy: string
    requestedAt: string
    completedAt: string | null
  }>(zip, 'data-deletion-records')

  for (const record of records) {
    await db.dataDeletionRecord.create({
      data: {
        entityType: record.entityType,
        entityId: record.entityId,
        requestedBy: record.requestedBy,
        requestedAt: new Date(record.requestedAt),
        completedAt: record.completedAt ? new Date(record.completedAt) : null,
        congregationId,
      },
    })
  }
}
