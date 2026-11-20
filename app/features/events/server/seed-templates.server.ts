import { getDefaultTemplates, type Locale } from '~/features/events/model/seed-templates.data'
import { seedDefaultPartPresets } from './seed-part-presets.server'

// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and unscoped db
export async function seedDefaultTemplates(db: any, congregationId: number, locale: Locale) {
  // Presets first: the parts created below reference them. Both are programme
  // defaults for a brand-new congregation and share this one injection point
  // (see seedCongregationDefaults), so there is nothing extra for callers to wire.
  await seedDefaultPartPresets(db, congregationId, locale)

  const presets: { id: number; key: string }[] = await db.partPreset.findMany({
    where: { congregationId },
    select: { id: true, key: true },
  })
  const presetIdByKey = new Map(presets.map(preset => [preset.key, preset.id]))

  for (const tpl of getDefaultTemplates(locale)) {
    const existing = await db.eventTemplate.findFirst({
      where: { key: tpl.key, congregationId },
    })

    if (existing) continue

    await db.eventTemplate.create({
      data: {
        name: tpl.name,
        key: tpl.key,
        weekDay: tpl.weekDay,
        isRecurring: tpl.isRecurring,
        attendanceKind: tpl.attendanceKind,
        startTime: tpl.startTime,
        endTime: tpl.endTime,
        color: tpl.color,
        congregationId,
        parts: {
          create: tpl.parts.map(part => ({
            name: part.name,
            section: part.section,
            order: part.order,
            durationMin: part.durationMin,
            allowExternalSpeaker: part.allowExternalSpeaker,
            // `?? null` rather than a non-null assertion: a part whose kind the
            // seed cannot know stays unlinked instead of pointing somewhere wrong.
            presetId: part.preset ? (presetIdByKey.get(part.preset) ?? null) : null,
            congregationId,
          })),
        },
        serviceParts: {
          create: tpl.serviceParts.map((role, index) => ({
            name: role.name,
            key: role.key,
            order: index * 5,
            congregationId,
          })),
        },
      },
    })
  }
}
