import { EventKind } from '~/features/events/model/event-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { Permission } from '~/shared/types/permission'

type Locale = (typeof locales)[number]

/**
 * Ensure all Permission rows exist. Uses upsert so it is safe to call on every
 * setup / registration — existing permissions are kept, missing ones are created.
 *
 * Called from setup (single-tenant), registration (multi-tenant), and the seed script.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedPermissions(db: any) {
  for (const key of Object.values(Permission)) {
    await db.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    })
  }
}

// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
type SeedTemplatesFn = (db: any, congregationId: number, locale: Locale) => Promise<void>

/**
 * Seed the default event kinds for a newly created congregation.
 * Pass `seedTemplates` to also seed programme templates — the caller must supply
 * it to avoid a domain→feature dependency inversion.
 */
export async function seedCongregationDefaults(
  // biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
  db: any,
  congregationId: number,
  locale: Locale,
  seedTemplates: SeedTemplatesFn = async () => {},
) {
  await db.eventKind.upsert({
    where: { key_congregationId: { key: EventKind.Off, congregationId } },
    update: {},
    create: {
      name: m.seed_event_kind_absence({}, { locale }),
      key: EventKind.Off,
      color: '#cfcfcf',
      congregationId,
    },
  })

  await seedTemplates(db, congregationId, locale)
}
