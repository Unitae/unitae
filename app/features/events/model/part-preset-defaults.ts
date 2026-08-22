import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { PartPresetKey } from './part-preset.type'

type Locale = (typeof locales)[number]

// Paraglide messages take an inputs object and an options bag; these carry no
// inputs, but the locale option is what lets the resolvers answer for a
// congregation other than the ambient one.
type MessageFn = (inputs?: Record<string, never>, options?: { locale?: Locale }) => string

// Display text for the seeded kinds, resolved at render rather than stored.
//
// The same convention Role uses for its built-ins: the row keeps null and the
// label comes from the message catalogue, so a congregation that switches
// language sees its kinds switch too. A congregation that renames one stores
// its own text, and that wins — see partPresetName.
const BUILT_IN_NAMES: Record<string, MessageFn> = {
  [PartPresetKey.Prayer]: m.seed_preset_prayer,
  [PartPresetKey.Chairman]: m.seed_preset_chairman,
  [PartPresetKey.SpiritualGems]: m.seed_preset_spiritual_gems,
  [PartPresetKey.SpiritualPearls]: m.seed_preset_spiritual_pearls,
  [PartPresetKey.BibleReading]: m.seed_preset_bible_reading,
  [PartPresetKey.SchoolDemonstration]: m.seed_preset_school_demonstration,
  [PartPresetKey.SchoolTalk]: m.seed_preset_school_talk,
  [PartPresetKey.ChristianLifeTalk]: m.seed_preset_christian_life_talk,
  [PartPresetKey.PublicTalk]: m.seed_preset_public_talk,
  [PartPresetKey.WatchtowerStudy]: m.seed_preset_watchtower_study,
  [PartPresetKey.CongregationBibleStudy]: m.seed_preset_congregation_bible_study,
}

// What each slot is called, per kind. Without these a seeded kind would fall
// back to the generic "Orateur"/"Lecteur", losing the distinctions that make
// the labels worth having — a Watchtower study has a Conducteur, a school
// demonstration a Proclamateur and an Interlocuteur.
const BUILT_IN_SPEAKER_LABELS: Record<string, MessageFn> = {
  [PartPresetKey.Prayer]: m.seed_preset_label_brother,
  [PartPresetKey.Chairman]: m.seed_preset_label_chairman,
  [PartPresetKey.SpiritualGems]: m.seed_preset_label_speaker,
  [PartPresetKey.SpiritualPearls]: m.seed_preset_label_conductor,
  [PartPresetKey.BibleReading]: m.seed_preset_label_reader,
  [PartPresetKey.SchoolDemonstration]: m.seed_preset_label_publisher,
  [PartPresetKey.SchoolTalk]: m.seed_preset_label_speaker,
  [PartPresetKey.ChristianLifeTalk]: m.seed_preset_label_speaker,
  [PartPresetKey.PublicTalk]: m.seed_preset_label_speaker,
  [PartPresetKey.WatchtowerStudy]: m.seed_preset_label_conductor,
  [PartPresetKey.CongregationBibleStudy]: m.seed_preset_label_conductor,
}

// Only the kinds done by two people appear here; the rest have no second slot.
const BUILT_IN_READER_LABELS: Record<string, MessageFn> = {
  [PartPresetKey.SchoolDemonstration]: m.seed_preset_label_counterpart,
  [PartPresetKey.WatchtowerStudy]: m.seed_preset_label_reader,
  [PartPresetKey.CongregationBibleStudy]: m.seed_preset_label_reader,
}

export const SHARE_MESSAGES: Record<Locale, Record<PartPresetKey, string>> = {
  fr: {
    [PartPresetKey.Prayer]:
      'Bonjour {{assigneeFirstname}},\n\nTu as la prière le {{date}} à {{time}} ({{eventName}}).\n\n{{link}}',
    [PartPresetKey.Chairman]:
      'Bonjour {{assigneeFirstname}},\n\nTu présides la réunion du {{date}} à {{time}}.\n\n{{link}}',
    [PartPresetKey.SpiritualGems]:
      'Bonjour {{assigneeFirstname}},\n\nTu as un discours dans les Joyaux de la Parole de Dieu le {{date}} à {{time}}.\nSujet : {{topic}}\nDurée : {{duration}}\nNote : {{note}}\n\n{{link}}',
    [PartPresetKey.SpiritualPearls]:
      'Bonjour {{assigneeFirstname}},\n\nTu conduis « Recherchons des perles spirituelles » le {{date}} à {{time}}.\nDurée : {{duration}}\nNote : {{note}}\n\n{{link}}',
    [PartPresetKey.BibleReading]:
      'Bonjour {{assigneeFirstname}},\n\nTu as la lecture de la Bible le {{date}} à {{time}}.\nPassage : {{topic}}\nDurée : {{duration}}\nNote : {{note}}\n\n{{link}}',
    [PartPresetKey.SchoolDemonstration]:
      "Bonjour {{assigneeFirstname}},\n\nTu as un sujet de l'école le {{date}} à {{time}}.\nSujet : {{topic}}\nDurée : {{duration}}\nAvec : {{assistant}}\nNote : {{note}}\n\n{{link}}",
    [PartPresetKey.SchoolTalk]:
      "Bonjour {{assigneeFirstname}},\n\nTu as un discours de l'école le {{date}} à {{time}}.\nSujet : {{topic}}\nDurée : {{duration}}\nNote : {{note}}\n\n{{link}}",
    [PartPresetKey.ChristianLifeTalk]:
      'Bonjour {{assigneeFirstname}},\n\nTu as un discours dans « Vie chrétienne » le {{date}} à {{time}}.\nSujet : {{topic}}\nDurée : {{duration}}\nNote : {{note}}\n\n{{link}}',
    [PartPresetKey.PublicTalk]:
      'Bonjour {{assigneeFirstname}},\n\nTu donnes le discours public le {{date}} à {{time}}.\nThème : {{topic}}\nNote : {{note}}\n\n{{link}}',
    [PartPresetKey.WatchtowerStudy]:
      "Bonjour {{assigneeFirstname}},\n\nTu conduis l'Étude de La Tour de Garde le {{date}} à {{time}}.\nLecteur : {{assistant}}\nNote : {{note}}\n\n{{link}}",
    [PartPresetKey.CongregationBibleStudy]:
      "Bonjour {{assigneeFirstname}},\n\nTu conduis l'étude biblique de l'assemblée le {{date}} à {{time}}.\nLecteur : {{assistant}}\nNote : {{note}}\n\n{{link}}",
  },
  en: {
    [PartPresetKey.Prayer]:
      'Hi {{assigneeFirstname}},\n\nYou have the prayer on {{date}} at {{time}} ({{eventName}}).\n\n{{link}}',
    [PartPresetKey.Chairman]:
      'Hi {{assigneeFirstname}},\n\nYou are chairing the meeting on {{date}} at {{time}}.\n\n{{link}}',
    [PartPresetKey.SpiritualGems]:
      "Hi {{assigneeFirstname}},\n\nYou have a talk in Treasures From God's Word on {{date}} at {{time}}.\nTopic: {{topic}}\nLength: {{duration}}\nNote: {{note}}\n\n{{link}}",
    [PartPresetKey.SpiritualPearls]:
      'Hi {{assigneeFirstname}},\n\nYou are conducting Digging for Spiritual Gems on {{date}} at {{time}}.\nLength: {{duration}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.BibleReading]:
      'Hi {{assigneeFirstname}},\n\nYou have the Bible reading on {{date}} at {{time}}.\nPassage: {{topic}}\nLength: {{duration}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.SchoolDemonstration]:
      'Hi {{assigneeFirstname}},\n\nYou have a school demonstration on {{date}} at {{time}}.\nTopic: {{topic}}\nLength: {{duration}}\nWith: {{assistant}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.SchoolTalk]:
      'Hi {{assigneeFirstname}},\n\nYou have a school talk on {{date}} at {{time}}.\nTopic: {{topic}}\nLength: {{duration}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.ChristianLifeTalk]:
      'Hi {{assigneeFirstname}},\n\nYou have a talk in Living as Christians on {{date}} at {{time}}.\nTopic: {{topic}}\nLength: {{duration}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.PublicTalk]:
      'Hi {{assigneeFirstname}},\n\nYou are giving the public talk on {{date}} at {{time}}.\nTheme: {{topic}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.WatchtowerStudy]:
      'Hi {{assigneeFirstname}},\n\nYou are conducting the Watchtower Study on {{date}} at {{time}}.\nReader: {{assistant}}\nNote: {{note}}\n\n{{link}}',
    [PartPresetKey.CongregationBibleStudy]:
      'Hi {{assigneeFirstname}},\n\nYou are conducting the Congregation Bible Study on {{date}} at {{time}}.\nReader: {{assistant}}\nNote: {{note}}\n\n{{link}}',
  },
}

/**
 * What to call a kind.
 *
 * A stored name wins — it is the congregation's own wording and must not be
 * overwritten by a language change. Otherwise a seeded kind resolves from the
 * catalogue, and anything else falls back to its key so a picker never renders
 * an empty row.
 */
export function partPresetName(preset: { key: string; name: string | null }, locale?: Locale): string {
  if (preset.name) return preset.name
  const builtIn = BUILT_IN_NAMES[preset.key]
  if (!builtIn) return preset.key
  return locale ? builtIn({}, { locale }) : builtIn()
}

/**
 * The body sent to whoever is assigned a part of this kind.
 *
 * Null means the kind stores no wording of its own, so the built-in body for
 * the locale applies — that is the state every seeded kind is in, and the state
 * a congregation returns to by clearing the field.
 *
 * Stored text always wins, including the empty string. Nothing can currently
 * write one: the form maps a blank field to null (part-preset.schema.ts), so
 * "no message at all" is not expressible for a seeded kind. A kind a
 * congregation invented has no catalogue entry and so sends nothing, which is
 * the only way to reach that today. Opting a seeded kind out of sharing needs
 * a control of its own before this branch means anything.
 */
export function partPresetShareMessage(preset: { key: string; shareMessage: string | null }, locale: Locale): string {
  if (preset.shareMessage !== null) return preset.shareMessage
  return SHARE_MESSAGES[locale]?.[preset.key as PartPresetKey] ?? ''
}

function resolveLabel(
  stored: string | null,
  key: string,
  table: Record<string, MessageFn>,
  locale?: Locale,
): string | null {
  if (stored) return stored
  const builtIn = table[key]
  if (!builtIn) return null
  return locale ? builtIn({}, { locale }) : builtIn()
}

/** Stored label wins; otherwise the kind's built-in; otherwise the generic default. */
export function partPresetSpeakerLabel(
  preset: { key: string; speakerLabel: string | null },
  locale?: Locale,
): string | null {
  return resolveLabel(preset.speakerLabel, preset.key, BUILT_IN_SPEAKER_LABELS, locale)
}

export function partPresetReaderLabel(
  preset: { key: string; readerLabel: string | null },
  locale?: Locale,
): string | null {
  return resolveLabel(preset.readerLabel, preset.key, BUILT_IN_READER_LABELS, locale)
}

/**
 * Whether a kind will produce a message at all.
 *
 * Deliberately locale-free: a seeded kind has a body in every locale, so this
 * answers the "is there a message" question without the caller having to pick
 * one. Null falls through to the catalogue, which is why a kind a congregation
 * invented answers false until it is given wording.
 */
export function hasPartPresetShareMessage(preset: { key: string; shareMessage: string | null }): boolean {
  if (preset.shareMessage !== null) return preset.shareMessage.trim() !== ''
  return SHARE_MESSAGES.fr[preset.key as PartPresetKey] !== undefined
}
