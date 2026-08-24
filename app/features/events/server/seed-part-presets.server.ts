import { PartPresetKey, PartPresetScope } from '~/features/events/model/part-preset.type'
import type { locales } from '~/i18n/paraglide/runtime'

type Locale = (typeof locales)[number]

/**
 * What a seeded kind *is*, reduced to the two things a row has to carry.
 *
 * Names, slot labels and the share message are deliberately absent. Those come
 * from the catalogue at render time — see model/part-preset-defaults.ts — so a
 * congregation that switches language sees its kinds switch too, and one that
 * renames a kind stores only its own wording. It is the convention Role already
 * uses for its built-ins.
 */
interface PresetCapability {
  key: PartPresetKey
  hasReaderSlot: boolean
  allowExternalSpeaker: boolean
}

const PRESETS: PresetCapability[] = [
  // A visiting brother may offer prayer.
  { key: PartPresetKey.Prayer, hasReaderSlot: false, allowExternalSpeaker: true },
  { key: PartPresetKey.Chairman, hasReaderSlot: false, allowExternalSpeaker: false },
  // One kind for every midweek-meeting talk (Joyaux, Perles, Vie chrétienne).
  // External speakers stay possible: a visiting brother may take a talk.
  { key: PartPresetKey.MidweekTalk, hasReaderSlot: false, allowExternalSpeaker: true },
  { key: PartPresetKey.BibleReading, hasReaderSlot: false, allowExternalSpeaker: false },
  // The only school part with two people on stage.
  { key: PartPresetKey.SchoolDemonstration, hasReaderSlot: true, allowExternalSpeaker: false },
  { key: PartPresetKey.SchoolTalk, hasReaderSlot: false, allowExternalSpeaker: false },
  { key: PartPresetKey.PublicTalk, hasReaderSlot: false, allowExternalSpeaker: true },
  { key: PartPresetKey.WatchtowerStudy, hasReaderSlot: true, allowExternalSpeaker: false },
  { key: PartPresetKey.CongregationBibleStudy, hasReaderSlot: true, allowExternalSpeaker: false },
]

// Exported so the test asserts against the catalogue's real size rather than a
// hand-copied number that silently rots when a kind is added.
export const PART_PRESET_COUNT = PRESETS.length

/**
 * Seeds the system presets for one congregation. Idempotent per key, matching
 * seedDefaultTemplates — re-running after a new kind is added backfills only
 * that kind and leaves edited rows alone.
 *
 * The locale argument is retained for call-site compatibility and is no longer
 * used: nothing language-specific is stored any more.
 */
// biome-ignore lint/suspicious/noExplicitAny: matches seedDefaultTemplates, called with a scoped client
export async function seedDefaultPartPresets(db: any, congregationId: number, _locale: Locale): Promise<void> {
  for (const preset of PRESETS) {
    const existing = await db.partPreset.findFirst({ where: { key: preset.key, congregationId } })
    if (existing) continue

    await db.partPreset.create({
      data: {
        key: preset.key,
        // Null rather than text: the catalogue supplies the wording, so storing
        // it here would freeze the language at seed time.
        name: null,
        speakerLabel: null,
        readerLabel: null,
        shareMessage: null,
        scope: PartPresetScope.Part,
        hasReaderSlot: preset.hasReaderSlot,
        allowExternalSpeaker: preset.allowExternalSpeaker,
        isSystem: true,
        congregationId,
      },
    })
  }
}
