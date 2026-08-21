import { PartPresetKey } from '~/features/events/model/part-preset.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import type { TransactionClient } from '~/shared/infra/db.server'

type Locale = (typeof locales)[number]

// A rule matches a part by the name the seed gave it, optionally narrowed by
// section. `section: undefined` means the name alone is decisive.
interface MatchRule {
  name: string
  section?: string
  preset: PartPresetKey
}

// Seeded parts whose kind can be read off the name with confidence.
//
// Three groups are deliberately absent, and must stay absent:
//   - the ministry parts ("1re partie"…), whose kind changes week to week
//   - songs, which are not assignments
//   - the Memorial talk, which is its own thing and would be mislabelled by
//     the public-talk message
//
// Getting one of these wrong is worse than leaving it null: an unlinked part
// simply has no share button, whereas a mislinked one sends the wrong text.
function getRules(locale: Locale): MatchRule[] {
  const gems = m.seed_section_spiritual_gems({}, { locale })
  const christianLife = m.seed_section_christian_life({}, { locale })

  return [
    { name: m.seed_part_song_and_prayer({}, { locale }), preset: PartPresetKey.Prayer },
    { name: m.seed_part_song_and_closing_prayer({}, { locale }), preset: PartPresetKey.Prayer },
    { name: m.seed_part_prayer_bread({}, { locale }), preset: PartPresetKey.Prayer },
    { name: m.seed_part_prayer_wine({}, { locale }), preset: PartPresetKey.Prayer },
    { name: m.seed_part_search_spiritual_pearls({}, { locale }), preset: PartPresetKey.SpiritualPearls },
    { name: m.seed_part_bible_reading({}, { locale }), preset: PartPresetKey.BibleReading },
    { name: m.seed_part_congregation_bible_study({}, { locale }), preset: PartPresetKey.CongregationBibleStudy },
    { name: m.seed_part_public_discourse({}, { locale }), preset: PartPresetKey.PublicTalk },
    { name: m.seed_part_watchtower_study({}, { locale }), preset: PartPresetKey.WatchtowerStudy },
    // "Discours" on its own is far too generic to match — a congregation may
    // have used it anywhere. Only the one sitting in the spiritual gems section
    // is known to be the ten-minute talk.
    { name: m.seed_part_discourse({}, { locale }), section: gems, preset: PartPresetKey.SpiritualGems },
    // Same generic names appear under both ministry and Christian life. Only
    // the latter has a single possible kind.
    { name: m.seed_part_first_part({}, { locale }), section: christianLife, preset: PartPresetKey.ChristianLifeTalk },
    { name: m.seed_part_second_part({}, { locale }), section: christianLife, preset: PartPresetKey.ChristianLifeTalk },
  ]
}

interface PartRow {
  id: number
  name: string
  section: string
}

export interface PartPresetBackfillResult {
  templateParts: number
  eventParts: number
  unmatched: number
}

// Compares on a trimmed, case-folded form. Congregations routinely re-case or
// pad these labels ("Bible Reading" vs the seeded "Bible reading"), and an
// exact match would silently drop those rows into the unmatched pile. The whole
// name must still correspond — this loosens punctuation-free casing only, not
// the match itself.
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function findRule(rules: MatchRule[], part: PartRow): MatchRule | undefined {
  const name = normalize(part.name)
  const section = normalize(part.section)
  return rules.find(
    rule => normalize(rule.name) === name && (rule.section === undefined || normalize(rule.section) === section),
  )
}

/**
 * Links existing programme parts to the preset describing their kind.
 *
 * Idempotent: only rows with a null `presetId` are considered, so re-running
 * after a manual correction leaves that correction alone. Unmatched rows are
 * counted and reported rather than force-fitted — the caller surfaces the
 * number so the remaining manual work is visible instead of silent.
 */
export async function backfillCongregationPartPresets(
  db: TransactionClient,
  congregationId: number,
  locale: Locale,
): Promise<PartPresetBackfillResult> {
  const presets = await db.partPreset.findMany({ where: { congregationId }, select: { id: true, key: true } })
  const presetIdByKey = new Map(presets.map(preset => [preset.key, preset.id]))
  const rules = getRules(locale)

  const result: PartPresetBackfillResult = { templateParts: 0, eventParts: 0, unmatched: 0 }

  const templateParts = await db.templatePart.findMany({
    where: { congregationId, presetId: null },
    select: { id: true, name: true, section: true },
  })
  for (const part of templateParts) {
    const presetId = presetIdByKey.get(findRule(rules, part)?.preset ?? '')
    if (presetId == null) {
      result.unmatched += 1
      continue
    }
    await db.templatePart.update({ where: { id_congregationId: { id: part.id, congregationId } }, data: { presetId } })
    result.templateParts += 1
  }

  const eventParts = await db.eventPart.findMany({
    where: { congregationId, presetId: null },
    select: { id: true, name: true, section: true },
  })
  for (const part of eventParts) {
    const presetId = presetIdByKey.get(findRule(rules, part)?.preset ?? '')
    if (presetId == null) {
      result.unmatched += 1
      continue
    }
    await db.eventPart.update({ where: { id_congregationId: { id: part.id, congregationId } }, data: { presetId } })
    result.eventParts += 1
  }

  return result
}
