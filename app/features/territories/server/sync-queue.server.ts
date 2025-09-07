import { Queue } from 'bullmq'
import { redis } from '~/shared/libs/redis.server'

export const syncQueue = new Queue('syncQueue', {
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
