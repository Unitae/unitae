import { Queue } from 'bullmq'
import {
  THUMBNAIL_QUEUE_ATTEMPTS,
  THUMBNAIL_QUEUE_BACKOFF_MS,
  THUMBNAIL_QUEUE_REMOVE_ON_COMPLETE,
  THUMBNAIL_QUEUE_REMOVE_ON_FAIL,
} from '~/shared/constants/queue-delays'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const thumbnailQueue = new Queue(QUEUE_NAMES.thumbnail, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: THUMBNAIL_QUEUE_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: THUMBNAIL_QUEUE_BACKOFF_MS,
    },
    removeOnComplete: THUMBNAIL_QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: THUMBNAIL_QUEUE_REMOVE_ON_FAIL,
  },
})

export interface ThumbnailJobData {
  congregationId: number
  documentId: number
  pdfStorageKey: string
}
