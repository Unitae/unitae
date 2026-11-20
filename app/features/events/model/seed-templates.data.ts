import { AttendanceKind } from '~/features/events/model/attendance-kind.type'
import { EventTemplateKey } from '~/features/events/model/event-template.type'
import { PartPresetKey } from '~/features/events/model/part-preset.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'

// What a new congregation's templates hold: the midweek and weekend meetings and the Memorial, their parts and services.

export type Locale = (typeof locales)[number]

interface PartDefinition {
  name: string
  section: string
  order: number
  durationMin: number | null
  allowExternalSpeaker: boolean
  // Which kind of assignment this part is. Left undefined where the seed
  // genuinely cannot know: the three ministry parts ("1re partie"…) are a
  // different kind every week, and songs are not assignments at all. Those are
  // chosen per event rather than guessed here — a wrong preset would send a
  // confidently wrong message.
  preset?: PartPresetKey
}

interface ServicePartDefinition {
  name: string
  key: string
}

interface TemplateDefinition {
  name: string
  key: string
  weekDay: number | null
  isRecurring: boolean
  attendanceKind: AttendanceKind
  startTime: string
  endTime: string
  color: string
  parts: PartDefinition[]
  serviceParts: ServicePartDefinition[]
}

function getSharedServiceParts(locale: Locale): ServicePartDefinition[] {
  return [
    { name: m.seed_service_sound({}, { locale }), key: 'sono' },
    { name: m.seed_service_stage({}, { locale }), key: 'stage' },
    { name: m.seed_service_reception({}, { locale }), key: 'welcome' },
    { name: m.seed_service_cleaning({}, { locale }), key: 'cleaning' },
  ]
}

/** The templates a new congregation starts with, named in its language. */
export function getDefaultTemplates(locale: Locale): TemplateDefinition[] {
  const sharedServiceParts = getSharedServiceParts(locale)

  return [
    {
      name: m.seed_template_midweek({}, { locale }),
      key: EventTemplateKey.MidweekMeeting,
      attendanceKind: AttendanceKind.Midweek,
      weekDay: 2, // Tuesday
      isRecurring: true,
      startTime: '19:00',
      endTime: '20:45',
      color: '#3b82f6',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_discourse({}, { locale }),
          preset: PartPresetKey.MidweekTalk,
          section: m.seed_section_spiritual_gems({}, { locale }),
          order: 2,
          durationMin: 10,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_search_spiritual_pearls({}, { locale }),
          preset: PartPresetKey.MidweekTalk,
          section: m.seed_section_spiritual_gems({}, { locale }),
          order: 3,
          durationMin: 10,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_bible_reading({}, { locale }),
          preset: PartPresetKey.BibleReading,
          section: m.seed_section_spiritual_gems({}, { locale }),
          order: 4,
          durationMin: 4,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_first_part({}, { locale }),
          section: m.seed_section_ministry({}, { locale }),
          order: 5,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_second_part({}, { locale }),
          section: m.seed_section_ministry({}, { locale }),
          order: 6,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_third_part({}, { locale }),
          section: m.seed_section_ministry({}, { locale }),
          order: 7,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        { name: m.seed_part_song({}, { locale }), section: '', order: 8, durationMin: 5, allowExternalSpeaker: false },
        {
          name: m.seed_part_first_part({}, { locale }),
          preset: PartPresetKey.MidweekTalk,
          section: m.seed_section_christian_life({}, { locale }),
          order: 9,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_second_part({}, { locale }),
          preset: PartPresetKey.MidweekTalk,
          section: m.seed_section_christian_life({}, { locale }),
          order: 10,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_congregation_bible_study({}, { locale }),
          preset: PartPresetKey.CongregationBibleStudy,
          section: m.seed_section_christian_life({}, { locale }),
          order: 11,
          durationMin: 30,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 12,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceParts: sharedServiceParts,
    },
    {
      name: m.seed_template_weekend({}, { locale }),
      key: EventTemplateKey.WeekendMeeting,
      attendanceKind: AttendanceKind.Weekend,
      weekDay: 6, // Saturday
      isRecurring: true,
      startTime: '10:00',
      endTime: '11:45',
      color: '#10b981',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_public_discourse({}, { locale }),
          preset: PartPresetKey.PublicTalk,
          section: '',
          order: 2,
          durationMin: 30,
          allowExternalSpeaker: true,
        },
        { name: m.seed_part_song({}, { locale }), section: '', order: 3, durationMin: 5, allowExternalSpeaker: false },
        {
          name: m.seed_part_watchtower_study({}, { locale }),
          preset: PartPresetKey.WatchtowerStudy,
          section: '',
          order: 4,
          durationMin: 60,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 5,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceParts: sharedServiceParts,
    },
    {
      name: m.seed_template_memorial({}, { locale }),
      key: EventTemplateKey.Memorial,
      attendanceKind: AttendanceKind.Separate,
      weekDay: null,
      isRecurring: false,
      startTime: '19:00',
      endTime: '20:30',
      color: '#f59e0b',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_memorial_discourse({}, { locale }),
          section: '',
          order: 2,
          durationMin: 45,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_prayer_bread({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 3,
          durationMin: null,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_prayer_wine({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 4,
          durationMin: null,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          preset: PartPresetKey.Prayer,
          section: '',
          order: 5,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceParts: sharedServiceParts,
    },
    {
      name: m.seed_template_freeform({}, { locale }),
      key: EventTemplateKey.Freeform,
      attendanceKind: AttendanceKind.None,
      weekDay: null,
      isRecurring: false,
      startTime: '19:00',
      endTime: '21:00',
      color: '#6366f1',
      parts: [],
      serviceParts: [],
    },
  ]
}
