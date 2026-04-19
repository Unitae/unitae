import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { redis } from '~/shared/infra/redis.server'

export const thumbnailQueue = new Queue(QUEUE_NAMES.thumbnail, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 20,
    removeOnFail: 10,
  },
})

export interface ThumbnailJobData {
  congregationId: number
  documentId: number
  pdfStorageKey: string
}
