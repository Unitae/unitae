import { notify } from '~/features/notifications/index.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

/**
 * Checks all documents whose visibility expires within the next 48 hours
 * and notifies display board validators through the notification pipeline.
 */
export async function checkExpiringDocuments(): Promise<{
  congregationsNotified: number
  documentsFound: number
}> {
  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)

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
    return { congregationsNotified: 0, documentsFound: 0 }
  }

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

  for (const [congregationId, documents] of byCongregation) {
    try {
      await withScope(congregationId, db =>
        notify(db, {
          type: 'board.document.expiring',
          entityType: 'Congregation',
          entityId: congregationId,
          congregationId,
          payload: { documents },
        }),
      )
      congregationsNotified++
    } catch (error) {
      logger.error('Failed to process expiration notifications for congregation', { congregationId, error })
    }
  }

  return { congregationsNotified, documentsFound: expiringDocuments.length }
}
