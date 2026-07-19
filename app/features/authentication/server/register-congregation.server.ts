import { seedDefaultTemplates } from '~/features/events/index.server'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'

type Locale = (typeof locales)[number]

import { unscopedDb as db, withScope } from '~/shared/infra/db.server'

export async function registerCongregation(
  congregationName: string,
  congregationSlug: string,
  adminEmail: string,
  adminPassword: string,
  locale: Locale,
) {
  const existingCongregation = await db.congregation.findUnique({ where: { slug: congregationSlug } })
  if (existingCongregation) {
    return { error: m.auth_register_slug_taken_error() }
  }

  const existingUser = await db.userAccount.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (existingUser) {
    return { error: m.auth_register_email_taken_error() }
  }

  await seedPermissions(db)

  const hashedPassword = await hash(adminPassword)

  const congregation = await db.congregation.create({
    data: {
      name: congregationName,
      slug: congregationSlug,
      locale,
    },
  })

  const user = await db.userAccount.create({
    data: {
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      emailVerifiedAt: new Date(),
      congregationId: congregation.id,
    },
  })

  // Assign admin permission
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
    await seedCongregationDefaults(scopedDb, congregation.id, locale, seedDefaultTemplates)
    await syncBuiltInRoleAssignments(scopedDb, user.id, congregation.id, user.id)
  })

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return { congregationSlug: congregation.slug, userId: user.id }
}
