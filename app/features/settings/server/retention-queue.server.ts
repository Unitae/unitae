import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const retentionQueue = new Queue(QUEUE_NAMES.retention, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    // A missed cron slot is fine — the next slot picks up the same
    // candidates. No retry needed.
    attempts: 1,
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
})

export interface RetentionJobData {
  triggeredAt: string
}
