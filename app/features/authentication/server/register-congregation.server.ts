import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { seedCongregationDefaults } from '~/shared/domain/setup.server'
import * as m from '~/paraglide/messages'
import type { locales } from '~/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'

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

  const existingUser = await db.user.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (existingUser) {
    return { error: m.auth_register_email_taken_error() }
  }

  const hashedPassword = await hash(adminPassword)

  const congregation = await db.congregation.create({
    data: {
      name: congregationName,
      slug: congregationSlug,
      locale,
    },
  })

  const user = await db.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      emailVerifiedAt: new Date(),
      congregationId: congregation.id,
    },
  })

  // Assign admin role
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
    await seedCongregationDefaults(scopedDb, congregation.id, locale)
  })

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return { congregationSlug: congregation.slug, userId: user.id }
}
