import { randomBytes } from 'node:crypto'
import { seedDefaultTemplates } from '~/features/events/index.server'
import { seedBuiltInTerritoryKinds } from '~/features/territories/index.server'
import * as m from '~/i18n/paraglide/messages'
import type { locales } from '~/i18n/paraglide/runtime'
import { hash } from '~/shared/auth/crypto.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/shared/domain/consent.server'
import { ensureAdminRole, seedCongregationDefaults, seedPermissions } from '~/shared/domain/setup.server'
import { createLogger } from '~/shared/infra/logger.server'

type Locale = (typeof locales)[number]

import { unscopedDb as db, withScope } from '~/shared/infra/db.server'

const logger = createLogger('register-congregation')

// A random suffix is always appended so the exact public subdomain cannot be
// predicted from the congregation name. This removes the tenant-enumeration
// oracle: a taken base name no longer produces a distinct error an attacker can
// observe.
async function generateUniqueSlug(baseSlug: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${baseSlug}-${randomBytes(4).toString('hex')}`
    const existing = await db.congregation.findUnique({ where: { slug: candidate } })
    if (!existing) return candidate
  }

  throw new Error('Unable to generate a unique congregation slug')
}

export async function registerCongregation(
  congregationName: string,
  congregationSlug: string,
  adminEmail: string,
  adminPassword: string,
  locale: Locale,
) {
  const existingUser = await db.userAccount.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (existingUser) {
    return { error: m.auth_register_email_taken_error() }
  }

  await seedPermissions(db)

  const hashedPassword = await hash(adminPassword)

  // Keep provisioning on the return-based error contract: slug exhaustion and a
  // concurrent unique-slug collision (P2002 on the @unique column) both surface
  // as a logged, graceful error instead of an unhandled 500 in the route.
  let congregation: Awaited<ReturnType<typeof db.congregation.create>>
  try {
    const slug = await generateUniqueSlug(congregationSlug)
    congregation = await db.congregation.create({
      data: {
        name: congregationName,
        slug,
        locale,
      },
    })
  } catch (error) {
    logger.error('Failed to provision congregation', { baseSlug: congregationSlug, error })
    return { error: m.auth_register_generic_error() }
  }

  const user = await db.userAccount.create({
    data: {
      email: adminEmail.toLowerCase(),
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

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return { congregationSlug: congregation.slug, userId: user.id }
}
