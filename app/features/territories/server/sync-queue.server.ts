import { Queue } from 'bullmq'
import {
  SYNC_QUEUE_ATTEMPTS,
  SYNC_QUEUE_BACKOFF_MS,
  SYNC_QUEUE_REMOVE_ON_COMPLETE,
  SYNC_QUEUE_REMOVE_ON_FAIL,
} from '~/shared/constants/queue-delays'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const syncQueue = new Queue(QUEUE_NAMES.sync, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: SYNC_QUEUE_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: SYNC_QUEUE_BACKOFF_MS,
    },
    removeOnComplete: SYNC_QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: SYNC_QUEUE_REMOVE_ON_FAIL,
  },
})

export interface SyncJobData {
  userEmail: string
  userName?: string
  congregationId: number
}
