import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

// Cleans up old notification events to keep the table small.
// sent/cancelled: 7 days, failed: 30 days.
export async function cleanupNotificationEvents(): Promise<number> {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const sentCancelled = await unscopedDb.notificationEvent.deleteMany({
    where: {
      status: { in: ['sent', 'cancelled'] },
      processedAt: { lt: sevenDaysAgo },
    },
  })

  const failed = await unscopedDb.notificationEvent.deleteMany({
    where: {
      status: 'failed',
      processedAt: { lt: thirtyDaysAgo },
    },
  })

  const total = sentCancelled.count + failed.count
  if (total > 0) {
    logger.info(
      `Cleaned up ${total} notification events (${sentCancelled.count} sent/cancelled, ${failed.count} failed)`,
    )
  }

  return total
}
