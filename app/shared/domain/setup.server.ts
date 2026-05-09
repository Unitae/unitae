import { EventKind } from '~/features/events/model/event-kind.type'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { BUILT_IN_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
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

  await seedBuiltInRoles(db, congregationId)
}

/**
 * Idempotently upsert the seven built-in roles for a congregation. Built-ins have
 * null name/description — display strings are sourced from Paraglide via
 * `getRoleDisplayName` / `getRoleDescription` so locale switches don't require DB writes.
 *
 * After upserting, BoardViewer is granted to the `publisher` built-in role so
 * publishers retain board access by default — matching the legacy behaviour where
 * every authenticated user could view the board.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedBuiltInRoles(db: any, congregationId: number) {
  for (const key of BUILT_IN_ROLE_KEYS) {
    await db.role.upsert({
      where: { key_congregationId: { key, congregationId } },
      update: { isBuiltIn: true },
      create: { key, isBuiltIn: true, congregationId },
    })
  }

  const publisherRole = await db.role.findUnique({
    where: { key_congregationId: { key: 'publisher', congregationId } },
    select: { id: true },
  })
  const boardViewer = await db.permission.findUnique({
    where: { key: Permission.BoardViewer },
    select: { id: true },
  })
  if (publisherRole != null && boardViewer != null) {
    await db.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: publisherRole.id, permissionId: boardViewer.id },
      },
      update: {},
      create: {
        roleId: publisherRole.id,
        permissionId: boardViewer.id,
        congregationId,
      },
    })
  }
}
