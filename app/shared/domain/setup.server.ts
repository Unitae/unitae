import { EventKind } from '~/features/events/model/event-kind.type'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'
import * as m from '~/paraglide/messages'
import type { locales } from '~/paraglide/runtime'

type Locale = (typeof locales)[number]

/**
 * Seed the default event kinds and programme templates for a newly created congregation.
 * Called from both first-user setup (single-tenant) and congregation registration (multi-tenant).
 *
 * NOTE: This function deliberately imports from features/events — it acts as a shared orchestrator
 * for congregation bootstrapping, centralising the cross-feature dependency in one place.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedCongregationDefaults(db: any, congregationId: number, locale: Locale) {
  await db.eventKind.create({
    data: {
      name: m.seed_event_kind_absence({}, { locale }),
      key: EventKind.Off,
      color: '#cfcfcf',
      congregationId,
    },
  })

  await seedDefaultTemplates(db, congregationId, locale)
}
