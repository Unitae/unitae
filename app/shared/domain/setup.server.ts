import type { locales } from '~/i18n/paraglide/runtime'
import { BUILT_IN_ROLE_KEYS, SYSTEM_ROLE_KEYS } from '~/shared/domain/built-in-roles.server'
import { createLogger } from '~/shared/infra/logger.server'
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
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
type SeedTerritoryKindsFn = (db: any, congregationId: number) => Promise<void>

/**
 * Seed the default programme templates, roles and territory kinds for a newly
 * created congregation. Pass `seedTemplates` / `seedTerritoryKinds` to inject the
 * feature-owned seeders — the caller must supply them to avoid a domain→feature
 * dependency inversion.
 */
export async function seedCongregationDefaults(
  // biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
  db: any,
  congregationId: number,
  locale: Locale,
  seedTemplates: SeedTemplatesFn = async () => {},
  seedTerritoryKinds: SeedTerritoryKindsFn = async () => {},
) {
  await seedTemplates(db, congregationId, locale)
  await seedTerritoryKinds(db, congregationId)

  await seedBuiltInRoles(db, congregationId)
}

/**
 * Idempotently upsert the built-in identity roles and system roles for a congregation. Built-ins have
 * null name/description — display strings are sourced from Paraglide via
 * `getRoleDisplayName` / `getRoleDescription` so locale switches don't require DB writes.
 *
 * After upserting, BoardViewer is granted to the `publisher` built-in role so
 * publishers retain board access by default — matching the legacy behaviour where
 * every authenticated user could view the board.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function seedBuiltInRoles(db: any, congregationId: number) {
  // Identity roles (synced from Member flags) and system roles (granted by hand) are
  // both undeletable, so both carry isBuiltIn. Only the first group has predicates in
  // built-in-roles.server.ts, which is why the sync there matches on key, not the flag.
  for (const key of [...BUILT_IN_ROLE_KEYS, ...SYSTEM_ROLE_KEYS]) {
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

/**
 * The system role that carries `Permission.Admin`.
 *
 * Was `can-do-anything` while the #149 backfill minted one role per permission. That
 * shape is gone: `admin` is now a system role seeded into every congregation alongside
 * the identity roles, and `20260826120000_replace_auto_roles_with_admin_role` carries
 * existing `can-do-anything` holders onto it.
 */
export const ADMIN_ROLE_KEY = 'admin'

/**
 * Idempotently ensure the congregation has a role granting `admin`, returning its
 * id — or `null` when the `admin` Permission row is somehow absent, which leaves
 * provisioning to continue rather than failing the whole registration.
 *
 * Created as a *system* role (`isBuiltIn: true`) with a null name: it must not be
 * renamed or deleted — a congregation with no admin role cannot be administered — and
 * `getRoleDisplayName` resolves the label from the message catalogue instead of a
 * language pinned into the database.
 *
 * `seedBuiltInRoles` already creates it; this stays idempotent so the two provisioning
 * paths can run in either order.
 */
// biome-ignore lint/suspicious/noExplicitAny: accepts both PrismaClient and scoped transaction client
export async function ensureAdminRole(db: any, congregationId: number): Promise<number | null> {
  const adminPermission = await db.permission.findUnique({
    where: { key: Permission.Admin },
    select: { id: true },
  })
  if (adminPermission == null) {
    // Both callers run seedPermissions immediately before this, so reaching here
    // means that write did not take effect — and the congregation is about to be
    // provisioned with nobody able to administer it. Provisioning still
    // continues (a half-created congregation is worse than an admin-less one),
    // but this must not pass without a trace.
    createLogger('setup').error('Admin permission row is missing — congregation provisioned without an admin role', {
      congregationId,
    })
    return null
  }

  const role = await db.role.upsert({
    where: { key_congregationId: { key: ADMIN_ROLE_KEY, congregationId } },
    update: {},
    create: { key: ADMIN_ROLE_KEY, isBuiltIn: true, congregationId },
    select: { id: true },
  })

  await db.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: adminPermission.id } },
    update: {},
    create: { roleId: role.id, permissionId: adminPermission.id, congregationId },
  })

  return role.id
}
