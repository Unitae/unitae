import type { Job } from 'bullmq'
import { notify } from '~/features/notifications/index.server'
import { withScope } from '~/shared/infra/db.server'
import { createLogger } from '~/shared/infra/logger.server'
import { importOpenData } from '../server/import-open-data.server'
import type { SyncJobData } from '../server/sync-queue.server'

const logger = createLogger('sync-worker')

export async function handleSyncWork(job: Job<SyncJobData>): Promise<void> {
  const { userId, congregationId } = job.data

  try {
    await job.updateProgress(0)
    logger.info(`Starting sync job ${job.id}`, { userId, congregationId })

    await withScope(congregationId, async db => {
      await importOpenData(db, congregationId, (percent: number) => {
        logger.info(`Sync job ${job.id} progress: ${percent}%`, { userId })
        if (percent < 99) {
          job.updateProgress(percent)
        }
      })

      await notify(db, {
        type: 'territory.sync.completed',
        entityType: 'Congregation',
        entityId: congregationId,
        congregationId,
        recipientId: userId,
        actorId: userId,
      })
    })

    await job.updateProgress(100)
  } catch (error) {
    logger.error(`Sync job ${job.id} failed`, {
      error,
      userId,
      congregationId,
      attemptsMade: job.attemptsMade,
    })
    throw error
  }
}
