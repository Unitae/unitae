import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'

type Locale = (typeof locales)[number]

interface PartDefinition {
  name: string
  section: string
  order: number
  durationMin: number | null
  allowExternalSpeaker: boolean
}

interface ServiceRoleDefinition {
  name: string
  key: string
}

interface TemplateDefinition {
  name: string
  key: string
  weekDay: number | null
  isRecurring: boolean
  startTime: string
  endTime: string
  parts: PartDefinition[]
  serviceRoles: ServiceRoleDefinition[]
}

function getSharedServiceRoles(locale: Locale): ServiceRoleDefinition[] {
  return [
    { name: m.seed_service_sound({}, { locale }), key: 'sono' },
    { name: m.seed_service_stage({}, { locale }), key: 'stage' },
    { name: m.seed_service_reception({}, { locale }), key: 'welcome' },
    { name: m.seed_service_cleaning({}, { locale }), key: 'cleaning' },
  ]
}

function getTemplates(locale: Locale): TemplateDefinition[] {
  const sharedServiceRoles = getSharedServiceRoles(locale)

  return [
    {
      name: m.seed_template_midweek({}, { locale }),
      key: ProgrammeTemplateKey.MidweekMeeting,
      weekDay: 2, // Tuesday
      isRecurring: true,
      startTime: '19:00',
      endTime: '20:45',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
          section: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_discourse({}, { locale }),
          section: m.seed_section_spiritual_gems({}, { locale }),
          order: 2,
          durationMin: 10,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_search_spiritual_pearls({}, { locale }),
          section: m.seed_section_spiritual_gems({}, { locale }),
          order: 3,
          durationMin: 10,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_bible_reading({}, { locale }),
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
          section: m.seed_section_christian_life({}, { locale }),
          order: 9,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_second_part({}, { locale }),
          section: m.seed_section_christian_life({}, { locale }),
          order: 10,
          durationMin: null,
          allowExternalSpeaker: true,
        },
        {
          name: m.seed_part_congregation_bible_study({}, { locale }),
          section: m.seed_section_christian_life({}, { locale }),
          order: 11,
          durationMin: 30,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          section: '',
          order: 12,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceRoles: sharedServiceRoles,
    },
    {
      name: m.seed_template_weekend({}, { locale }),
      key: ProgrammeTemplateKey.WeekendMeeting,
      weekDay: 6, // Saturday
      isRecurring: true,
      startTime: '10:00',
      endTime: '11:45',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
          section: '',
          order: 1,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_public_discourse({}, { locale }),
          section: '',
          order: 2,
          durationMin: 30,
          allowExternalSpeaker: true,
        },
        { name: m.seed_part_song({}, { locale }), section: '', order: 3, durationMin: 5, allowExternalSpeaker: false },
        {
          name: m.seed_part_watchtower_study({}, { locale }),
          section: '',
          order: 4,
          durationMin: 60,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          section: '',
          order: 5,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceRoles: sharedServiceRoles,
    },
    {
      name: m.seed_template_memorial({}, { locale }),
      key: ProgrammeTemplateKey.Memorial,
      weekDay: null,
      isRecurring: false,
      startTime: '19:00',
      endTime: '20:30',
      parts: [
        {
          name: m.seed_part_song_and_prayer({}, { locale }),
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
          section: '',
          order: 3,
          durationMin: null,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_prayer_wine({}, { locale }),
          section: '',
          order: 4,
          durationMin: null,
          allowExternalSpeaker: false,
        },
        {
          name: m.seed_part_song_and_closing_prayer({}, { locale }),
          section: '',
          order: 5,
          durationMin: 5,
          allowExternalSpeaker: false,
        },
      ],
      serviceRoles: sharedServiceRoles,
    },
  ]
}

// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and unscoped db
export async function seedDefaultTemplates(db: any, congregationId: number, locale: Locale) {
  for (const tpl of getTemplates(locale)) {
    const existing = await db.programmeTemplate.findFirst({
      where: { key: tpl.key, congregationId },
    })

    if (existing) continue

    await db.programmeTemplate.create({
      data: {
        name: tpl.name,
        key: tpl.key,
        weekDay: tpl.weekDay,
        isRecurring: tpl.isRecurring,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        congregationId,
        parts: {
          create: tpl.parts.map(part => ({
            name: part.name,
            section: part.section,
            order: part.order,
            durationMin: part.durationMin,
            allowExternalSpeaker: part.allowExternalSpeaker,
            congregationId,
          })),
        },
        serviceRoles: {
          create: tpl.serviceRoles.map(role => ({
            name: role.name,
            key: role.key,
            congregationId,
          })),
        },
      },
    })
  }
}
