import { seedDefaultTemplates } from '~/features/events/index.server'
import { seedBuiltInTerritoryKinds } from '~/features/territories/index.server'
import type { locales } from '~/i18n/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { ensureAdminRole, seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'

type Locale = (typeof locales)[number]

import { unscopedDb as db, withScope } from '~/shared/infra/db.server'

export async function setupFirstAccount(
  email: string,
  password: string,
  congregationName: string,
  congregationSlug: string,
  locale: Locale,
): Promise<number | null> {
  // The first admin of a fresh install only: once any account exists, refuse whoever the caller is.
  if ((await db.userAccount.count()) > 0) return null

  await seedPermissions(db)

  const hashedPassword = await hash(password)

  // In single-tenant mode, the seed may have already created a congregation. Reuse it instead of creating a
  // duplicate, under the name and in the language the admin chose.
  const existingCongregation = await db.congregation.findFirst()
  const congregation =
    existingCongregation == null
      ? await db.congregation.create({ data: { name: congregationName, slug: congregationSlug, locale } })
      : await db.congregation.update({
          where: { id: existingCongregation.id },
          data: { name: congregationName, locale },
        })

  const user = await db.userAccount.create({
    data: {
      email,
      password: hashedPassword,
      emailVerifiedAt: new Date(),
      congregationId: congregation.id,
    },
  })

  // Create default programme templates (including the system day-off and
  // freeform templates) inside a scoped transaction so PostgreSQL RLS allows
  // the inserts. The admin role belongs here too: Role, RolePermission and
  // UserRoleAssignment are all RLS-scoped, unlike the direct grant this replaced.
  await withScope(congregation.id, async scopedDb => {
    await seedCongregationDefaults(scopedDb, congregation.id, locale, seedDefaultTemplates, seedBuiltInTerritoryKinds)

    const adminRoleId = await ensureAdminRole(scopedDb, congregation.id)
    if (adminRoleId != null) {
      await scopedDb.userRoleAssignment.create({
        data: { userId: user.id, roleId: adminRoleId, congregationId: congregation.id },
      })
    }

    await syncBuiltInRoleAssignments(scopedDb, user.id, congregation.id, user.id)
  })

  // Record the initial GDPR consent.
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return user.id
}
