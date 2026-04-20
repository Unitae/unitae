import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { redis } from '~/shared/infra/redis.server'

export const syncQueue = new Queue(QUEUE_NAMES.sync, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 10,
  },
})

export interface SyncJobData {
  userEmail: string
  userName?: string
  congregationId: number
}
