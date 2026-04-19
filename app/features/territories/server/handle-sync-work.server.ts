import type { Job } from 'bullmq'
import { resolveCongregation } from '~/shared/domain/congregation.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { importOpenData } from './import-open-data.server'
import { sendMailAfterDataSync } from './send-mail-after-data-sync.server'
import type { SyncJobData } from './sync-queue.server'

const logger = createLogger('sync-worker')

export async function handleSyncWork(job: Job<SyncJobData>): Promise<void> {
  const { userEmail, userName, congregationId } = job.data

  const congregation = await resolveCongregation(congregationId)

  try {
    await job.updateProgress(0)
    logger.info(`Starting sync job ${job.id}`, { userEmail, congregationId })

    await withScope(congregationId, async db => {
      await importOpenData(db, congregationId, (percent: number) => {
        logger.info(`Sync job ${job.id} progress: ${percent}%`, { userEmail })
        if (percent < 99) {
          job.updateProgress(percent)
        }
      })
    })

    await sendMailAfterDataSync(userEmail, userName, congregation)

    await job.updateProgress(100)
  } catch (error) {
    logger.error(`Sync job ${job.id} failed`, {
      error,
      userEmail,
      congregationId,
      attemptsMade: job.attemptsMade,
    })
    throw error
  }
}
