import { PartPresetKey, PartPresetScope } from '~/features/events/model/part-preset.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'

type Locale = (typeof locales)[number]

// A preset says what a part *is* and what it *can do* — never what it defaults
// to. Duration, section and name-per-occurrence belong to TemplatePart; putting
// them here would make the preset a second defaults layer and defeat the split.
interface PresetDefinition {
  key: PartPresetKey
  name: string
  hasReaderSlot: boolean
  speakerLabel: string
  // Present exactly when hasReaderSlot is true.
  readerLabel: string | null
  allowExternalSpeaker: boolean
  shareMessage: string
}

// Default share-message bodies, by locale.
//
// Deliberately NOT Paraglide messages. Two reasons, either sufficient:
//   - The inlang format reads `{...}` as a message parameter, so `{{topic}}`
//     compiles into a required input rather than surviving as literal text.
//   - These are seed *data*, not UI copy. Once seeded they are copied onto the
//     PartPreset row and owned by the congregation, which edits them freely;
//     nothing ever re-reads them from the message catalogue.
//
// Placeholders are resolved by renderShareMessage — see model/share-message.ts.
// Optional details sit on their own line so the line-drop rule removes them
// cleanly when empty, rather than leaving a bare "Sujet :" behind.
const SHARE_MESSAGES: Record<Locale, Record<PartPresetKey, string>> = {
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

function getPresets(locale: Locale): PresetDefinition[] {
  const speaker = m.seed_preset_label_speaker({}, { locale })
  const conductor = m.seed_preset_label_conductor({}, { locale })
  const reader = m.seed_preset_label_reader({}, { locale })

  return [
    {
      key: PartPresetKey.Prayer,
      name: m.seed_preset_prayer({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: m.seed_preset_label_brother({}, { locale }),
      readerLabel: null,
      // A visiting brother may offer prayer.
      allowExternalSpeaker: true,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.Prayer],
    },
    {
      key: PartPresetKey.Chairman,
      name: m.seed_preset_chairman({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: m.seed_preset_label_chairman({}, { locale }),
      readerLabel: null,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.Chairman],
    },
    {
      key: PartPresetKey.SpiritualGems,
      name: m.seed_preset_spiritual_gems({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: speaker,
      readerLabel: null,
      // Local assignment.
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.SpiritualGems],
    },
    {
      key: PartPresetKey.SpiritualPearls,
      name: m.seed_preset_spiritual_pearls({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: conductor,
      readerLabel: null,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.SpiritualPearls],
    },
    {
      key: PartPresetKey.BibleReading,
      name: m.seed_preset_bible_reading({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: reader,
      readerLabel: null,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.BibleReading],
    },
    {
      key: PartPresetKey.SchoolDemonstration,
      name: m.seed_preset_school_demonstration({}, { locale }),
      // The only school part with two people on stage.
      hasReaderSlot: true,
      speakerLabel: m.seed_preset_label_publisher({}, { locale }),
      readerLabel: m.seed_preset_label_counterpart({}, { locale }),
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.SchoolDemonstration],
    },
    {
      key: PartPresetKey.SchoolTalk,
      name: m.seed_preset_school_talk({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: speaker,
      readerLabel: null,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.SchoolTalk],
    },
    {
      key: PartPresetKey.ChristianLifeTalk,
      name: m.seed_preset_christian_life_talk({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: speaker,
      readerLabel: null,
      allowExternalSpeaker: true,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.ChristianLifeTalk],
    },
    {
      key: PartPresetKey.PublicTalk,
      name: m.seed_preset_public_talk({}, { locale }),
      hasReaderSlot: false,
      speakerLabel: speaker,
      readerLabel: null,
      allowExternalSpeaker: true,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.PublicTalk],
    },
    {
      key: PartPresetKey.WatchtowerStudy,
      name: m.seed_preset_watchtower_study({}, { locale }),
      hasReaderSlot: true,
      speakerLabel: conductor,
      readerLabel: reader,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.WatchtowerStudy],
    },
    {
      key: PartPresetKey.CongregationBibleStudy,
      name: m.seed_preset_congregation_bible_study({}, { locale }),
      hasReaderSlot: true,
      speakerLabel: conductor,
      readerLabel: reader,
      allowExternalSpeaker: false,
      shareMessage: SHARE_MESSAGES[locale][PartPresetKey.CongregationBibleStudy],
    },
  ]
}

// Exported so the test asserts against the catalogue's real size rather than a
// hand-copied number that silently rots when a kind is added.
export const PART_PRESET_COUNT = Object.keys(PartPresetKey).length

// Seeds the system presets for one congregation. Idempotent per key, matching
// seedDefaultTemplates — re-running after a new kind is added backfills only
// that kind and leaves edited rows alone.
//
// Deliberately does not populate allowedRoles: eligibility still lives on
// TemplatePart/EventPart until it is migrated onto the preset, and seeding it
// here now would create a second, unread source of truth.
// biome-ignore lint/suspicious/noExplicitAny: matches seedDefaultTemplates, called with a scoped client
export async function seedDefaultPartPresets(db: any, congregationId: number, locale: Locale): Promise<void> {
  for (const preset of getPresets(locale)) {
    const existing = await db.partPreset.findFirst({ where: { key: preset.key, congregationId } })
    if (existing) continue

    await db.partPreset.create({
      data: {
        key: preset.key,
        name: preset.name,
        scope: PartPresetScope.Part,
        hasReaderSlot: preset.hasReaderSlot,
        speakerLabel: preset.speakerLabel,
        readerLabel: preset.readerLabel,
        allowExternalSpeaker: preset.allowExternalSpeaker,
        shareMessage: preset.shareMessage,
        isSystem: true,
        congregationId,
      },
    })
  }
}
