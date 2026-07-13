import type { Job } from 'bullmq'
import { autoAnonymizeRetentionCandidates } from '~/features/settings/server/anonymize-retention.server'
import type { RetentionJobData } from '~/features/settings/server/retention-queue.server'
import { DEFAULT_RETENTION_MONTHS } from '~/shared/constants/limits'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('retention-worker')

/**
 * Iterates every active congregation and runs the auto-anonymize pass
 * for members past the retention window. Errors on a per-congregation
 * basis are logged and swallowed — one tenant's failure does not stop
 * the sweep.
 */
export async function handleRetentionWork(job: Job<RetentionJobData>): Promise<void> {
  const now = new Date()
  logger.info('Retention sweep starting', { triggeredAt: job.data.triggeredAt, jobId: job.id })

  const congregations = await unscopedDb.congregation.findMany({
    where: { active: true, suspendedAt: null },
    select: { id: true, slug: true },
  })

  let totalAnonymized = 0
  let totalSkipped = 0
  let failedCongregations = 0

  for (const cong of congregations) {
    try {
      const result = await withScope(cong.id, db =>
        autoAnonymizeRetentionCandidates(db, cong.id, 0, DEFAULT_RETENTION_MONTHS, now),
      )
      totalAnonymized += result.anonymized
      totalSkipped += result.skipped
      if (result.anonymized > 0 || result.skipped > 0) {
        logger.info('Retention sweep completed for congregation', {
          congregationId: cong.id,
          slug: cong.slug,
          anonymized: result.anonymized,
          skipped: result.skipped,
        })
      }
    } catch (error) {
      failedCongregations++
      logger.error('Retention sweep failed for congregation', {
        congregationId: cong.id,
        slug: cong.slug,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('Retention sweep done', {
    congregations: congregations.length,
    totalAnonymized,
    totalSkipped,
    failedCongregations,
  })
}
