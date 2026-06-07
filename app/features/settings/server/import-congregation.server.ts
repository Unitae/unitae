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
import { stripDiacritics } from '~/shared/utils/strip-diacritics'
import type { PublisherType } from '~/shared/types/publisher-type'
import {
  EntityIdMap,
  type ImportConflict,
  type ImportSummary,
  type ManifestJson,
  SUPPORTED_ARCHIVE_VERSIONS,
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

  if (!(SUPPORTED_ARCHIVE_VERSIONS as readonly string[]).includes(manifest.version)) {
    return {
      entityCounts: manifest.entityCounts,
      conflicts: [],
      warnings: [
        `Unsupported archive version: ${manifest.version} (expected one of: ${SUPPORTED_ARCHIVE_VERSIONS.join(', ')})`,
      ],
    }
  }

  const conflicts: ImportConflict[] = []
  const warnings: string[] = ['Passwords are not imported. Users will need to reset their password after import.']

  if (manifest.version === '1.0') {
    warnings.push(
      'Archive predates v1.1 — custom roles, external speakers, territory card overlays, perimeter, and role-based gating will not be imported.',
    )
    if (
      zip.file('data/congregation-user-permissions.ndjson') == null &&
      zip.file('data/congregation-user-roles.ndjson') != null
    ) {
      warnings.push(
        'Archive predates the UserRole → Permission rename; permission assignments will be migrated automatically.',
      )
    }
  }

  // v1.x → v2.0 shim: synthesize members.ndjson + user-accounts.ndjson from
  // the legacy users.ndjson so the rest of the validation reads the v2.0
  // layout uniformly.
  const shimWarnings = await migrateLegacyUsersNdjson(zip, manifest.version)
  warnings.push(...shimWarnings)

  // Check user-account email conflicts
  const accountsNdjson = await readNdjsonFile<{ email: string }>(zip, 'user-accounts')
  if (accountsNdjson.length > 0) {
    const importedEmails = accountsNdjson.map(u => u.email)
    const existingUsers = await unscopedDb.userAccount.findMany({
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
  const manifest = await readManifest(zip)

  // v1.x → v2.0 shim: split legacy users.ndjson into members + user-accounts
  // so the rest of runImport reads the v2.0 layout. Idempotent if the
  // archive is already v2.0.
  const shimWarnings = await migrateLegacyUsersNdjson(zip, manifest.version)
  if (shimWarnings.length > 0) {
    logger.info(`Imported legacy v${manifest.version} archive`, { congregationId, warnings: shimWarnings })
  }

  const idMap = new EntityIdMap()

  // Resolve global Permission keys -> ids upfront (these are shared, not per-congregation)
  const allPermissions = await unscopedDb.permission.findMany({ select: { id: true, key: true } })
  const permissionKeyToId = new Map(allPermissions.map(p => [p.key, p.id]))

  // Imports write thousands of rows in one atomic transaction — well past Prisma's
  // 5s default. Bump to 10 minutes; also raise maxWait so we don't fail to acquire
  // a pool connection on a busy instance.
  const importTransactionOptions = { timeout: 10 * 60 * 1000, maxWait: 30 * 1000 }

  await withScope(
    congregationId,
    async db => {
      const totalSteps = 38
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

      // 3. Roles (upsert by key — built-ins map to pre-seeded target rows; custom roles insert)
      await importRoles(zip, db, idMap, congregationId)
      await progress()

      // 4. Role permissions (depends on roles)
      await importRolePermissions(zip, db, idMap, permissionKeyToId, congregationId)
      await progress()

      // 5. Members (people in the congregation) and UserAccounts (logins)
      await importMembers(zip, db, idMap, congregationId)
      await importUserAccounts(zip, db, idMap, congregationId)
      await progress()

      // 6. User role assignments (depends on accounts + roles; overlaps with
      //    syncBuiltInRoleAssignments seeded during importMembers — composite PK
      //    absorbs duplicates).
      await importUserRoleAssignments(zip, db, idMap, congregationId)
      await progress()

      // 7. Congregation user permissions (legacy filename fallback for pre-#152 archives)
      await importCongregationUserPermissions(zip, db, idMap, permissionKeyToId, congregationId)
      await progress()

      // 8. Publisher groups (depends on users)
      await importPublisherGroups(zip, db, idMap, congregationId)
      await progress()

      // 9. Update member publisherGroupId (depends on groups)
      await updateMemberPublisherGroups(zip, db, idMap)
      await progress()

      // 10. Publisher activities (depends on users)
      await importPublisherActivities(zip, db, idMap, congregationId)
      await progress()

      // 11. External speakers (must run before programme part assignments)
      await importExternalSpeakers(zip, db, idMap, congregationId)
      await progress()

      // 12. Territories (upsert by number)
      await importTerritories(zip, db, idMap, congregationId)
      await progress()

      // 13. Territory card overlays
      await importTerritoryCardOverlays(zip, db, idMap, congregationId)
      await progress()

      // 14. Territory perimeter (upsert by congregationId — single row)
      await importTerritoryPerimeter(zip, db, congregationId)
      await progress()

      // 15. Buildings (upsert by number+street+zip)
      await importBuildings(zip, db, idMap, congregationId)
      await progress()

      // 16. Building entrances
      await importBuildingEntrances(zip, db, idMap, congregationId)
      await progress()

      // 17. Building accesses (depends on entrances)
      await importBuildingAccesses(zip, db, idMap, congregationId)
      await progress()

      // 18. Building residential data (depends on buildings + entrances)
      await importBuildingResidentialData(zip, db, idMap, congregationId)
      await progress()

      // 19. Territory-entrance links
      await importTerritoryEntranceLinks(zip, db, idMap)
      await progress()

      // 20. Building-entrance links
      await importBuildingEntranceLinks(zip, db, idMap)
      await progress()

      // 21. Attributions (depends on users + territories)
      await importAttributions(zip, db, idMap, congregationId)
      await progress()

      // 22. Programme templates (upsert by key)
      await importProgrammeTemplates(zip, db, idMap, congregationId)
      await progress()

      // 23. Programme template parts
      await importProgrammeTemplateParts(zip, db, idMap, congregationId)
      await progress()

      // 24. Programme template part allowed roles
      await importProgrammeTemplatePartAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      // 25. Programme template service roles
      await importProgrammeTemplateServiceRoles(zip, db, idMap, congregationId)
      await progress()

      // 26. Programme template service role allowed roles
      await importProgrammeTemplateServiceRoleAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      // 27. Programme template responsibles
      await importProgrammeTemplateResponsibles(zip, db, idMap, congregationId)
      await progress()

      // 28. Events (depends on event kinds + templates + users)
      await importEvents(zip, db, idMap, congregationId)
      await progress()

      // 29. Programme part assignments
      await importProgrammePartAssignments(zip, db, idMap, congregationId)
      await progress()

      // 30. Programme part assignment allowed roles
      await importProgrammePartAssignmentAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      // 31. Programme service role assignments
      await importProgrammeServiceRoleAssignments(zip, db, idMap, congregationId)
      await progress()

      // 32. Programme service role assignment allowed roles
      await importProgrammeServiceRoleAssignmentAllowedRoles(zip, db, idMap, congregationId)
      await progress()

      // 33. Board sections
      await importBoardSections(zip, db, idMap, congregationId)
      await progress()

      // 34. Board section visibility roles
      await importBoardSectionVisibilityRoles(zip, db, idMap, congregationId)
      await progress()

      // 35. Board documents (+ files)
      await importBoardDocuments(zip, db, idMap, congregationId)
      await progress()

      // 36. Board document versions (+ files)
      await importBoardDocumentVersions(zip, db, idMap, congregationId)
      await progress()

      // 37. Board dynamic document settings
      await importBoardDynamicDocumentSettings(zip, db, idMap, congregationId)
      await progress()

      // 38. Consent records
      await importConsentRecords(zip, db, idMap, congregationId)
      await progress()

      // Optional: audit logs
      await importAuditLogs(zip, db, idMap, congregationId)

      // Optional: data deletion records
      await importDataDeletionRecords(zip, db, congregationId)
    },
    importTransactionOptions,
  )

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

function writeNdjsonFile(zip: JsZip, name: string, records: object[]): void {
  if (records.length === 0) {
    zip.file(`data/${name}.ndjson`, '')
    return
  }
  const content = `${records.map(r => JSON.stringify(r)).join('\n')}\n`
  zip.file(`data/${name}.ndjson`, content)
}

interface LegacyUserRow {
  id: number
  firstname: string | null
  lastname: string | null
  email: string
  active: boolean
  emailVerifiedAt: string | null
  platformAdmin?: boolean
  isPublisher: boolean
  type?: string | null
  isMale?: boolean | null
  birthDate?: string | null
  baptismDate?: string | null
  isHelder?: boolean
  isServant?: boolean
  isAnointed?: boolean
  publisherGroupId?: number | null
  phone?: string | null
  address?: string | null
  anonymizedAt?: string | null
  createdAt: string
  updatedAt: string
}

// Same set of signals the original schema migration used to decide whether a
// legacy User row corresponds to a person in the congregation (Member) vs a
// pure login. Kept in sync with `app/database/migrations/.../migration.sql`.
function legacyUserIsMember(row: LegacyUserRow): boolean {
  return (
    row.isPublisher === true ||
    row.baptismDate != null ||
    row.isHelder === true ||
    row.isServant === true ||
    row.isAnointed === true ||
    row.publisherGroupId != null
  )
}

function isPlaceholderEmail(email: string): boolean {
  return email.endsWith('@placeholder.unitae.app')
}

/**
 * v1.x compatibility: legacy archives have a single `users.ndjson` carrying
 * both person-side fields (publisher status, baptism, …) and account-side
 * fields (email, password). When the archive is older than v2.0 and we see
 * `users.ndjson` but no `members.ndjson` / `user-accounts.ndjson`, split each
 * row into the new shape on the fly and write the synthesized NDJSON files
 * back into the in-memory zip. Downstream import functions then read the
 * v2.0 layout normally — no further code paths know about v1.x.
 *
 * Placeholder-email accounts (`*.placeholder.unitae.app`) are dropped:
 * they were never real logins, and any FK that pointed at them is preserved
 * by reusing the legacy id space on the Member side.
 *
 * Returns a list of warnings describing what was split / skipped, to surface
 * back to the operator running the import.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one row → up to two NDJSON shapes; the branches are the heuristic
export async function migrateLegacyUsersNdjson(zip: JsZip, manifestVersion: string): Promise<string[]> {
  if (manifestVersion !== '1.0' && manifestVersion !== '1.1') return []
  const legacyFile = zip.file('data/users.ndjson')
  if (!legacyFile) return []
  // Archives that already shipped v2.0 entries take precedence.
  if (zip.file('data/members.ndjson') != null || zip.file('data/user-accounts.ndjson') != null) {
    return []
  }

  const legacy = await readNdjsonFile<LegacyUserRow>(zip, 'users')

  const members: object[] = []
  const accounts: object[] = []
  let placeholderDropped = 0

  for (const row of legacy) {
    const isMember = legacyUserIsMember(row)
    const isRealAccount = !isPlaceholderEmail(row.email)

    if (isMember) {
      members.push({
        id: row.id,
        firstname: row.firstname ?? '',
        lastname: row.lastname ?? '',
        isPublisher: row.isPublisher,
        type: row.type ?? 'normal',
        isMale: row.isMale ?? null,
        phone: row.phone ?? '',
        address: row.address ?? '',
        birthDate: row.birthDate ?? null,
        baptismDate: row.baptismDate ?? null,
        isHelder: row.isHelder ?? false,
        isServant: row.isServant ?? false,
        isAnointed: row.isAnointed ?? false,
        leftAt: null,
        anonymizedAt: row.anonymizedAt ?? null,
        publisherGroupId: row.publisherGroupId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    }

    if (isRealAccount) {
      accounts.push({
        id: row.id,
        // Link to the Member only when we synthesized one (same id space).
        memberId: isMember ? row.id : null,
        // When the account isn't tied to a Member, keep the display name on
        // the account so it can still render.
        firstname: isMember ? null : (row.firstname ?? null),
        lastname: isMember ? null : (row.lastname ?? null),
        email: row.email,
        active: row.active,
        emailVerifiedAt: row.emailVerifiedAt ?? null,
        platformAdmin: row.platformAdmin ?? false,
        anonymizedAt: row.anonymizedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    } else {
      placeholderDropped++
    }
  }

  writeNdjsonFile(zip, 'members', members)
  writeNdjsonFile(zip, 'user-accounts', accounts)
  // No `member-role-assignments` synthesized — v1.x didn't track Member-side
  // identity roles. `syncBuiltInRoleAssignments` runs after Member inserts
  // during the regular import path and recomputes them from the flags.

  const warnings: string[] = [
    `Archive v${manifestVersion}: ${legacy.length} legacy user row(s) split into ${members.length} member(s) and ${accounts.length} account(s) on the fly.`,
  ]
  if (placeholderDropped > 0) {
    warnings.push(
      `${placeholderDropped} placeholder-email account(s) (legacy *@placeholder.unitae.app) skipped — they were never real logins.`,
    )
  }
  return warnings
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
export async function importMembers(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedMember {
    id: number
    firstname: string
    lastname: string
    isPublisher: boolean
    type: string
    isMale: boolean | null
    phone: string
    address: string
    birthDate: string | null
    baptismDate: string | null
    isHelder: boolean
    isServant: boolean
    isAnointed: boolean
    leftAt: string | null
    inactiveAt: string | null
    anonymizedAt: string | null
    publisherGroupId: number | null
    createdAt: string
    updatedAt: string
  }

  const records = await readNdjsonFile<ExportedMember>(zip, 'members')
  for (const record of records) {
    const created = await db.member.create({
      data: {
        firstname: record.firstname,
        lastname: record.lastname,
        firstnameNormalized: stripDiacritics(record.firstname),
        lastnameNormalized: stripDiacritics(record.lastname),
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
        leftAt: record.leftAt ? new Date(record.leftAt) : null,
        inactiveAt: record.inactiveAt ? new Date(record.inactiveAt) : null,
        anonymizedAt: record.anonymizedAt ? new Date(record.anonymizedAt) : null,
        congregationId,
      },
    })
    idMap.set('members', record.id, created.id)
    await syncBuiltInRoleAssignments(db, created.id, congregationId, null)
  }
}

export async function importUserAccounts(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  interface ExportedAccount {
    id: number
    memberId: number | null
    firstname: string | null
    lastname: string | null
    email: string
    active: boolean
    emailVerifiedAt: string | null
    platformAdmin: boolean
    anonymizedAt: string | null
    createdAt: string
    updatedAt: string
  }

  const records = await readNdjsonFile<ExportedAccount>(zip, 'user-accounts')
  for (const record of records) {
    const existing = await db.userAccount.findFirst({ where: { email: record.email } })

    if (existing) {
      if (existing.congregationId === congregationId) {
        const newMemberId = record.memberId != null ? idMap.getOptional('members', record.memberId) : null
        await db.userAccount.update({
          where: { id: existing.id },
          data: {
            firstname: record.firstname,
            lastname: record.lastname,
            active: record.active,
            memberId: newMemberId,
          },
        })
        idMap.set('user-accounts', record.id, existing.id)
      } else {
        logger.warn(`Skipping account ${record.email}: exists in another congregation`, { congregationId })
      }
    } else {
      const newMemberId = record.memberId != null ? idMap.getOptional('members', record.memberId) : null
      const created = await db.userAccount.create({
        data: {
          firstname: record.firstname,
          lastname: record.lastname,
          email: record.email,
          password: IMPORTED_PASSWORD_PLACEHOLDER,
          active: record.active,
          emailVerifiedAt: record.emailVerifiedAt ? new Date(record.emailVerifiedAt) : null,
          platformAdmin: false,
          anonymizedAt: record.anonymizedAt ? new Date(record.anonymizedAt) : null,
          memberId: newMemberId,
          congregationId,
        },
      })
      idMap.set('user-accounts', record.id, created.id)
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
  // Pre-#152 archives use the legacy `congregation-user-roles.ndjson` shape with `roleKey`.
  // The rename was a pure terminology change (UserRole table → Permission), so the keys are
  // identical and route through the same `permissionKeyToId` map.
  const records = await readNdjsonFile<{ userId: number; permissionKey: string }>(zip, 'congregation-user-permissions')
  const legacyRecords =
    records.length === 0
      ? (await readNdjsonFile<{ userId: number; roleKey: string }>(zip, 'congregation-user-roles')).map(r => ({
          userId: r.userId,
          permissionKey: r.roleKey,
        }))
      : []
  const merged = records.length > 0 ? records : legacyRecords

  for (const record of merged) {
    const userId = idMap.getOptional('user-accounts', record.userId)
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
      where: { id: memberId },
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
    kindId?: number | null
  }>(zip, 'programme-templates')

  for (const record of records) {
    const kindId = idMap.getOptional('event-kinds', record.kindId)
    const existing = await db.programmeTemplate.findFirst({ where: { key: record.key } })
    if (existing) {
      await db.programmeTemplate.update({
        where: { id: existing.id },
        data: {
          name: record.name,
          description: record.description,
          weekDay: record.weekDay,
          isRecurring: record.isRecurring,
          kindId,
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
          kindId,
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
    const createdById = idMap.getOptional('user-accounts', record.createdById)
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
    trackOrder?: number | null
    order: number
    durationMin: number | null
    eventId: number
    partId: number | null
    assigneeId: number | null
    assistantId: number | null
    allowExternalSpeaker?: boolean
    externalSpeakerId?: number | null
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
        trackOrder: record.trackOrder ?? null,
        order: record.order,
        durationMin: record.durationMin,
        eventId,
        partId: idMap.getOptional('programme-template-parts', record.partId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        assistantId: idMap.getOptional('members', record.assistantId),
        allowExternalSpeaker: record.allowExternalSpeaker ?? false,
        externalSpeakerId: idMap.getOptional('external-speakers', record.externalSpeakerId),
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

    const created = await db.programmeServiceRoleAssignment.create({
      data: {
        note: record.note,
        hasConflict: record.hasConflict,
        name: record.name,
        eventId,
        serviceRoleId: idMap.getOptional('programme-template-service-roles', record.serviceRoleId),
        assigneeId: idMap.getOptional('members', record.assigneeId),
        congregationId,
      },
    })
    idMap.set('programme-service-role-assignments', record.id, created.id)
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
        uploadedById: idMap.getOptional('user-accounts', record.uploadedById),
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
    const userId = idMap.getOptional('user-accounts', record.userId)
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
        actorId: idMap.getOptional('user-accounts', record.actorId),
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

// --- v1.1 entities ---

export async function importRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    key: string
    name: string | null
    description: string | null
    isBuiltIn: boolean
  }>(zip, 'roles')

  for (const record of records) {
    const existing = await db.role.findFirst({ where: { key: record.key } })
    if (existing) {
      // Built-in roles are pre-seeded for every congregation; map source id to existing target id.
      // Custom roles imported into a congregation that already has the same key get their
      // metadata refreshed but keep the target's id.
      await db.role.update({
        where: { id: existing.id },
        data: { name: record.name, description: record.description, isBuiltIn: record.isBuiltIn },
      })
      idMap.set('roles', record.id, existing.id)
    } else {
      const created = await db.role.create({
        data: {
          key: record.key,
          name: record.name,
          description: record.description,
          isBuiltIn: record.isBuiltIn,
          congregationId,
        },
      })
      idMap.set('roles', record.id, created.id)
    }
  }
}

export async function importRolePermissions(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  permissionKeyToId: Map<string, number>,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ roleId: number; permissionKey: string }>(zip, 'role-permissions')
  const data: { roleId: number; permissionId: number; congregationId: number }[] = []

  for (const record of records) {
    const roleId = idMap.getOptional('roles', record.roleId)
    const permissionId = permissionKeyToId.get(record.permissionKey)
    if (!roleId || !permissionId) continue
    data.push({ roleId, permissionId, congregationId })
  }

  if (data.length > 0) {
    await db.rolePermission.createMany({ data, skipDuplicates: true })
  }
}

export async function importUserRoleAssignments(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ userId: number; roleId: number }>(zip, 'user-role-assignments')
  const data: { userId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const userId = idMap.getOptional('user-accounts', record.userId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!userId || !roleId) continue
    data.push({ userId, roleId, congregationId })
  }

  if (data.length > 0) {
    // syncBuiltInRoleAssignments inside importUsers already inserted built-in role rows
    // matching each user's boolean flags. The composite (userId, roleId) PK absorbs duplicates;
    // this call adds custom-role memberships and any built-in assignments the source had that
    // the boolean-flag heuristic doesn't reproduce.
    await db.userRoleAssignment.createMany({ data, skipDuplicates: true })
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

export async function importBoardSectionVisibilityRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ sectionId: number; roleId: number }>(zip, 'board-section-visibility-roles')
  const data: { sectionId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const sectionId = idMap.getOptional('board-sections', record.sectionId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!sectionId || !roleId) continue
    data.push({ sectionId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.boardSectionVisibilityRole.createMany({ data, skipDuplicates: true })
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

export async function importProgrammePartAssignmentAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number; asKind: string }>(
    zip,
    'programme-part-assignment-allowed-roles',
  )
  const data: { assignmentId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const assignmentId = idMap.getOptional('programme-part-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!assignmentId || !roleId) continue
    data.push({ assignmentId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.programmePartAssignmentAllowedRole.createMany({ data, skipDuplicates: true })
  }
}

export async function importProgrammeServiceRoleAssignmentAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ assignmentId: number; roleId: number }>(
    zip,
    'programme-service-role-assignment-allowed-roles',
  )
  const data: { assignmentId: number; roleId: number; congregationId: number }[] = []

  for (const record of records) {
    const assignmentId = idMap.getOptional('programme-service-role-assignments', record.assignmentId)
    const roleId = idMap.getOptional('roles', record.roleId)
    if (!assignmentId || !roleId) continue
    data.push({ assignmentId, roleId, congregationId })
  }

  if (data.length > 0) {
    await db.programmeServiceRoleAssignmentAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
