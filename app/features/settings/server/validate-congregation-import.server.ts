import JsZip from 'jszip'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { getFileBuffer } from '~/shared/infra/file-storage.server'
import { type ImportConflict, type ImportSummary, SUPPORTED_ARCHIVE_VERSIONS } from './data-transfer.type'
import { migrateLegacyUsersNdjson } from './migrate-legacy-users-ndjson.server'
import { readManifest, readNdjsonFile } from './ndjson-archive'

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

  await collectUserAccountConflicts(zip, congregationId, conflicts, warnings)
  await collectScopedConflicts(zip, congregationId, conflicts)

  return { entityCounts: manifest.entityCounts, conflicts, warnings }
}

async function collectUserAccountConflicts(
  zip: JsZip,
  congregationId: number,
  conflicts: ImportConflict[],
  warnings: string[],
): Promise<void> {
  const accountsNdjson = await readNdjsonFile<{ email: string }>(zip, 'user-accounts')
  if (accountsNdjson.length === 0) return

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

async function collectScopedConflicts(zip: JsZip, congregationId: number, conflicts: ImportConflict[]): Promise<void> {
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
}
