import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const campaignQueue = new Queue(QUEUE_NAMES.campaign, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    // Date-driven and idempotent — a missed slot converges on the next tick.
    attempts: 1,
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 30 },
  },
})

export interface CampaignLifecycleJobData {
  triggeredAt: string
}
