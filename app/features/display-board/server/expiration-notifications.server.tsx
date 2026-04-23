import { unscopedDb } from '~/shared/infra/db.server'
import { emailQueue } from '~/shared/infra/email-queue.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'

/**
 * Verifie tous les documents dont la visibilite expire dans les 48 prochaines heures
 * et envoie une notification aux valideurs du tableau d'affichage.
 */
export async function checkExpiringDocuments(): Promise<{
  congregationsNotified: number
  documentsFound: number
  jobsEnqueued: number
}> {
  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // Find documents expiring within 48h across all congregations
  const expiringDocuments = await unscopedDb.boardDocument.findMany({
    where: {
      visibleUntil: {
        gte: now,
        lte: in48h,
      },
    },
    select: {
      id: true,
      title: true,
      congregationId: true,
      congregation: {
        select: {
          id: true,
          displayName: true,
          slug: true,
        },
      },
    },
  })

  if (expiringDocuments.length === 0) {
    return { congregationsNotified: 0, documentsFound: 0, jobsEnqueued: 0 }
  }

  // Group by congregation
  const byCongregation = new Map<number, { docs: { id: number; title: string }[]; displayName: string; slug: string }>()
  for (const doc of expiringDocuments) {
    const existing = byCongregation.get(doc.congregationId)
    if (existing) {
      existing.docs.push({ id: doc.id, title: doc.title })
    } else {
      byCongregation.set(doc.congregationId, {
        docs: [{ id: doc.id, title: doc.title }],
        displayName: doc.congregation.displayName ?? doc.congregation.slug,
        slug: doc.congregation.slug,
      })
    }
  }

  let congregationsNotified = 0
  let jobsEnqueued = 0

  for (const [congregationId, { docs, displayName, slug }] of byCongregation) {
    // Find BoardValidator users for this congregation
    const validators = await unscopedDb.user.findMany({
      where: {
        congregationId,
        active: true,
        congregationRoles: {
          some: {
            role: { key: Role.BoardValidator },
          },
        },
      },
      select: { email: true, firstname: true },
    })

    const baseUrl = process.env.BASE_URL ?? `https://${slug}.unitae.app`
    const emailFrom = `${displayName} <noreply@unitae.app>`

    const jobs = validators.map(user => ({
      name: 'documents-expiring',
      data: {
        type: 'documents-expiring' as const,
        congregationId,
        documents: docs,
        validatorEmail: user.email,
        validatorFirstname: user.firstname ?? undefined,
        emailFrom,
        baseUrl,
        displayName,
      },
    }))

    try {
      await emailQueue.addBulk(jobs)
      jobsEnqueued += jobs.length
    } catch (error) {
      logger.error('Failed to enqueue expiration notification jobs', { congregationId, error })
    }

    congregationsNotified++
  }

  return { congregationsNotified, documentsFound: expiringDocuments.length, jobsEnqueued }
}
