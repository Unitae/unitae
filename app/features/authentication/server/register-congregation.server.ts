import { EventKind } from '~/features/events/model/event-kind.type'
import { seedDefaultTemplates } from '~/features/events/server/seed-templates.server'
import { ConsentPurpose, recordConsentUnscoped } from '~/features/settings/server/consent.server'
import { hash } from '~/shared/libs/crypto.server'
import { unscopedDb as db } from '~/shared/libs/db.server'

export async function registerCongregation(
  congregationName: string,
  congregationSlug: string,
  adminEmail: string,
  adminPassword: string,
) {
  const existingCongregation = await db.congregation.findUnique({ where: { slug: congregationSlug } })
  if (existingCongregation) {
    return { error: "Ce nom d'assemblée locale est déjà pris." }
  }

  const existingUser = await db.user.findUnique({ where: { email: adminEmail.toLowerCase() } })
  if (existingUser) {
    return { error: 'Un compte existe déjà avec cette adresse email.' }
  }

  const hashedPassword = await hash(adminPassword)

  const congregation = await db.congregation.create({
    data: {
      name: congregationName,
      slug: congregationSlug,
    },
  })

  const user = await db.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
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

  // Create default EventKind
  await db.eventKind.create({
    data: {
      name: 'Absence',
      key: EventKind.Off,
      color: '#cfcfcf',
      congregationId: congregation.id,
    },
  })

  // Create default programme templates
  await seedDefaultTemplates(db, congregation.id)

  // Enregistrer le consentement RGPD initial
  await recordConsentUnscoped(user.id, congregation.id, ConsentPurpose.DataProcessing)

  return { congregationSlug: congregation.slug, userId: user.id }
}
