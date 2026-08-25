import { seedDefaultTemplates } from '~/features/events/index.server'
import { seedBuiltInTerritoryKinds } from '~/features/territories/index.server'
import type { locales } from '~/i18n/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'

type Locale = (typeof locales)[number]

import { unscopedDb as db, withScope } from '~/shared/infra/db.server'

export async function setupFirstAccount(
  email: string,
  password: string,
  congregationName: string,
  congregationSlug: string,
  locale: Locale,
) {
  await seedPermissions(db)

  const hashedPassword = await hash(password)

  // In single-tenant mode, the seed may have already created a congregation.
  // Reuse it instead of creating a duplicate.
  const existingCongregation = await db.congregation.findFirst()
  const congregation =
    existingCongregation ??
    (await db.congregation.create({
      data: {
        name: congregationName,
        slug: congregationSlug,
        locale,
      },
    }))

  const user = await db.userAccount.create({
    data: {
      email,
      password: hashedPassword,
      emailVerifiedAt: new Date(),
      congregationId: congregation.id,
    },
  })

  const adminPermission = await db.permission.findUnique({ where: { key: 'admin' } })
  if (adminPermission) {
    await db.congregationUserPermission.create({
      data: {
        userId: user.id,
        permissionId: adminPermission.id,
        congregationId: congregation.id,
      },
    })
  }

  // Create default programme templates (including the system day-off and
  // freeform templates) inside a scoped transaction so PostgreSQL RLS allows
  // the inserts.
  await withScope(congregation.id, async scopedDb => {
    await seedCongregationDefaults(scopedDb, congregation.id, locale, seedDefaultTemplates, seedBuiltInTerritoryKinds)
    await syncBuiltInRoleAssignments(scopedDb, user.id, congregation.id, user.id)
  })

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return user.id
}
