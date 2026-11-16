import type { Job } from 'bullmq'
import { extendRecurringEvents } from '~/features/events/server/recurring-events.server'
import type { RecurringEventsJobData } from '~/features/events/server/recurring-events-queue.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('recurring-events-worker')

/**
 * Iterates every active congregation and keeps its recurring templates' events created two months ahead, in the
 * congregation's own time zone. Per-congregation errors are logged and swallowed — one tenant's failure never stops
 * the sweep; the next run converges.
 */
export async function handleRecurringEventsWork(job: Job<RecurringEventsJobData>): Promise<void> {
  const now = new Date()
  logger.info('Recurring events sweep starting', { triggeredAt: job.data.triggeredAt, jobId: job.id })

  const congregations = await unscopedDb.congregation.findMany({
    where: { active: true, suspendedAt: null },
    select: { id: true, slug: true, timezone: true },
  })

  let created = 0
  let failed = 0
  for (const cong of congregations) {
    try {
      created += await withScope(cong.id, db =>
        extendRecurringEvents(db, { congregationId: cong.id, timeZone: cong.timezone, now }),
      )
    } catch (error) {
      failed++
      logger.error('Recurring events sweep failed for congregation', {
        congregationId: cong.id,
        slug: cong.slug,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('Recurring events sweep done', { congregations: congregations.length, created, failed })
}
