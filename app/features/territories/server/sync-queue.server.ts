import { Queue } from 'bullmq'
import {
  SYNC_QUEUE_ATTEMPTS,
  SYNC_QUEUE_REMOVE_ON_COMPLETE,
  SYNC_QUEUE_REMOVE_ON_FAIL,
} from '~/shared/constants/queue-delays'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const syncQueue = new Queue(QUEUE_NAMES.sync, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: SYNC_QUEUE_ATTEMPTS,
    removeOnComplete: SYNC_QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: SYNC_QUEUE_REMOVE_ON_FAIL,
  },
})

export interface SyncJobData {
  userId: number
  congregationId: number
  /** The BuildingSync run this job carries out. Absent on jobs queued before runs were recorded. */
  runId?: number
}
