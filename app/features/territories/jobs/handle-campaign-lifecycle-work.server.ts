import type { Job } from 'bullmq'
import { getCampaignsDueToActivate, getCampaignsDueToEnd } from '~/features/territories/server/campaign.queries'
import { activateCampaign, endCampaign } from '~/features/territories/server/campaign-lifecycle.workflow'
import type { CampaignLifecycleJobData } from '~/features/territories/server/campaign-queue.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { unscopedDb, withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'

const logger = createLogger('campaign-lifecycle-worker')

// Cron transitions run as the synthetic system actor, like retention.
const SYSTEM_ACTOR_ID = 0

/**
 * One congregation's date-driven pass: activate campaigns whose start day has
 * arrived, end campaigns whose inclusive endDate is fully past. Both
 * transitions are idempotent (guarded by activatedAt/endedAt), so a sweep that
 * runs late simply converges.
 */
export async function runCampaignLifecycleSweep(db: TransactionClient, congregationId: number, now: Date) {
  let activated = 0
  let ended = 0

  const dueToActivate = await getCampaignsDueToActivate(db, congregationId, now)
  for (const campaign of dueToActivate) {
    const result = await activateCampaign(db, campaign, congregationId, SYSTEM_ACTOR_ID, now)
    if (result.activated) activated++
  }

  const dueToEnd = await getCampaignsDueToEnd(db, congregationId, now)
  for (const campaign of dueToEnd) {
    const result = await endCampaign(db, campaign, congregationId, SYSTEM_ACTOR_ID, now)
    if (result.ended) ended++
  }

  return { activated, ended }
}

/**
 * Iterates every active congregation and runs the campaign lifecycle pass.
 * Per-congregation errors are logged and swallowed — one tenant's failure
 * never stops the sweep.
 */
export async function handleCampaignLifecycleWork(job: Job<CampaignLifecycleJobData>): Promise<void> {
  const now = new Date()
  logger.info('Campaign lifecycle sweep starting', { triggeredAt: job.data.triggeredAt, jobId: job.id })

  const congregations = await unscopedDb.congregation.findMany({
    where: { active: true, suspendedAt: null },
    select: { id: true, slug: true },
  })

  let totalActivated = 0
  let totalEnded = 0
  let failedCongregations = 0

  for (const cong of congregations) {
    try {
      const result = await withScope(cong.id, db => runCampaignLifecycleSweep(db, cong.id, now))
      totalActivated += result.activated
      totalEnded += result.ended
      if (result.activated > 0 || result.ended > 0) {
        logger.info('Campaign transitions applied', {
          congregationId: cong.id,
          slug: cong.slug,
          activated: result.activated,
          ended: result.ended,
        })
      }
    } catch (error) {
      failedCongregations++
      logger.error('Campaign lifecycle sweep failed for congregation', {
        congregationId: cong.id,
        slug: cong.slug,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  logger.info('Campaign lifecycle sweep done', {
    congregations: congregations.length,
    totalActivated,
    totalEnded,
    failedCongregations,
  })
}
