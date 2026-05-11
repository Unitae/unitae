import { findAccountsWithPermission } from '~/shared/auth/permissions.server'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { emailQueue } from '~/shared/infra/email-queue.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

/**
 * Checks all documents whose visibility expires within the next 48 hours
 * and sends a notification to display board validators.
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
    },
  })

  if (expiringDocuments.length === 0) {
    return { congregationsNotified: 0, documentsFound: 0, jobsEnqueued: 0 }
  }

  // Group by congregation
  const byCongregation = new Map<number, { id: number; title: string }[]>()
  for (const doc of expiringDocuments) {
    const existing = byCongregation.get(doc.congregationId)
    if (existing) {
      existing.push({ id: doc.id, title: doc.title })
    } else {
      byCongregation.set(doc.congregationId, [{ id: doc.id, title: doc.title }])
    }
  }

  let congregationsNotified = 0
  let jobsEnqueued = 0

  for (const [congregationId, docs] of byCongregation) {
    try {
      const congregation = await resolveCongregation(congregationId)

      // Find BoardValidator users for this congregation (active only).
      const accounts = await findAccountsWithPermission(unscopedDb, congregationId, Permission.BoardValidator)
      const validators = accounts.filter(a => a.active)

      const jobs = validators.map(user => ({
        name: 'documents-expiring',
        data: {
          type: 'documents-expiring' as const,
          congregationId,
          documents: docs,
          validatorEmail: user.email,
          validatorFirstname: user.firstname ?? undefined,
          emailFrom: congregation.emailFrom,
          baseUrl: congregation.baseUrl,
          displayName: congregation.displayName,
          locale: congregation.locale,
        },
      }))

      await emailQueue.addBulk(jobs)
      jobsEnqueued += jobs.length
      congregationsNotified++
    } catch (error) {
      logger.error('Failed to process expiration notifications for congregation', { congregationId, error })
    }
  }

  return { congregationsNotified, documentsFound: expiringDocuments.length, jobsEnqueued }
}
