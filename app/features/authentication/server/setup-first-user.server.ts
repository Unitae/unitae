import type { locales } from '~/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { seedCongregationDefaults, seedRoles } from '~/shared/domain/setup.server'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'

type Locale = (typeof locales)[number]

import { unscopedDb as db, withScope } from '~/shared/infra/db.server'

export async function setupFirstUser(
  email: string,
  password: string,
  congregationName: string,
  congregationSlug: string,
  locale: Locale,
) {
  await seedRoles(db)

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

  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      emailVerifiedAt: new Date(),
      congregationId: congregation.id,
    },
  })

  const adminRole = await db.userRole.findUnique({ where: { key: 'admin' } })
  if (adminRole) {
    await db.congregationUserRole.create({
      data: {
        userId: user.id,
        roleId: adminRole.id,
        congregationId: congregation.id,
      },
    })
  }

  // Create default EventKind and programme templates inside a scoped
  // transaction so PostgreSQL RLS allows the inserts.
  await withScope(congregation.id, async scopedDb => {
    await seedCongregationDefaults(scopedDb, congregation.id, locale, seedDefaultTemplates)
  })

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return user.id
}
