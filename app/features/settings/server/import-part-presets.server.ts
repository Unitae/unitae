import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

/**
 * Recreates the part presets — the kinds of programme part, and the message
 * sent to whoever is assigned one.
 *
 * Must run before the template and event part importers: those carry a
 * `presetId` that resolves through the map this fills. Pre-2.5 archives have no
 * preset file, so `readNdjsonFile` yields nothing and every part imports
 * unlinked — the same state a congregation is in before the backfill runs.
 */
export async function importPartPresets(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{
    id: number
    key: string
    name: string
    scope: string
    hasReaderSlot: boolean
    speakerLabel: string | null
    readerLabel: string | null
    allowExternalSpeaker: boolean
    shareMessage: string
    isSystem: boolean
  }>(zip, 'part-presets')

  for (const record of records) {
    const created = await db.partPreset.create({
      data: {
        key: record.key,
        name: record.name,
        scope: record.scope,
        hasReaderSlot: record.hasReaderSlot,
        speakerLabel: record.speakerLabel,
        readerLabel: record.readerLabel,
        allowExternalSpeaker: record.allowExternalSpeaker,
        shareMessage: record.shareMessage,
        // Carried rather than recomputed: a congregation may have edited a
        // seeded preset, and re-deriving isSystem from the key would either
        // discard that or resurrect a preset they deleted.
        isSystem: record.isSystem,
        congregationId,
      },
    })
    idMap.set('part-presets', record.id, created.id)
  }
}

export async function importPartPresetAllowedRoles(
  zip: JsZip,
  db: TransactionClient,
  idMap: EntityIdMap,
  congregationId: number,
): Promise<void> {
  const records = await readNdjsonFile<{ presetId: number; roleId: number; asKind: string }>(
    zip,
    'part-preset-allowed-roles',
  )
  const data: { presetId: number; roleId: number; asKind: string; congregationId: number }[] = []

  for (const record of records) {
    const presetId = idMap.getOptional('part-presets', record.presetId)
    const roleId = idMap.getOptional('roles', record.roleId)
    // A row whose preset or role did not import has nothing to point at.
    // Skipping matches how the other allowed-role importers handle it.
    if (!presetId || !roleId) continue
    data.push({ presetId, roleId, asKind: record.asKind, congregationId })
  }

  if (data.length > 0) {
    await db.partPresetAllowedRole.createMany({ data, skipDuplicates: true })
  }
}
