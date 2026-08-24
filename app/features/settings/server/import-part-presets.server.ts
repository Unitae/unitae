import type JsZip from 'jszip'
import type { TransactionClient } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import type { EntityIdMap } from './data-transfer.type'
import { readNdjsonFile } from './ndjson-archive'

const logger = createLogger('import-part-presets')

// The three seeded midweek talk kinds that v2.6 merged into 'midweek-talk'.
// Only system rows can carry these keys: seeding takes them first, so a
// congregation-created preset always slugs to something else.
const LEGACY_MIDWEEK_KEYS = new Set(['spiritual-gems', 'spiritual-pearls', 'christian-life-talk'])

/**
 * Recreates the part presets — the kinds of programme part, and the message
 * sent to whoever is assigned one.
 *
 * Must run before the template and event part importers: those carry a
 * `presetId` that resolves through the map this fills. Pre-2.5 archives have no
 * preset file, so `readNdjsonFile` yields nothing and every part imports
 * unlinked — the same state a congregation is in before the backfill runs.
 *
 * v2.5 archives carry the three midweek talk kinds this schema merged into
 * 'midweek-talk' (see the 20260824 migration): they fold into one row on
 * catalogue defaults, all three old ids mapping to it, so every part that
 * pointed at any of them stays linked. Custom wording stored on those rows is
 * dropped, matching what the migration did to live data. v2.5 archives may
 * also carry `part-preset-allowed-roles.ndjson`; eligibility now lives on the
 * parts, whose own rows import through the part importers, so that file is
 * discarded with a log line.
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

  let midweekTalkId: number | null = null
  for (const record of records) {
    if (record.isSystem && LEGACY_MIDWEEK_KEYS.has(record.key)) {
      if (midweekTalkId == null) {
        const merged = await db.partPreset.create({
          data: {
            key: 'midweek-talk',
            name: null,
            scope: record.scope,
            hasReaderSlot: false,
            speakerLabel: null,
            readerLabel: null,
            allowExternalSpeaker: true,
            shareMessage: null,
            isSystem: true,
            congregationId,
          },
        })
        midweekTalkId = merged.id
      }
      idMap.set('part-presets', record.id, midweekTalkId)
      continue
    }

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

  const legacyEligibility = await readNdjsonFile<{ presetId: number }>(zip, 'part-preset-allowed-roles')
  if (legacyEligibility.length > 0) {
    logger.warn(
      `Discarded ${legacyEligibility.length} preset-level eligibility rows from a v2.5 archive — eligibility now lives on the parts`,
      { congregationId },
    )
  }
}
