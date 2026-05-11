import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'
import type { ExportOptions } from './data-transfer.type'

export const dataTransferQueue = new Queue(QUEUE_NAMES.dataTransfer, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 10,
    removeOnFail: 10,
  },
})

export type DataTransferJobData =
  | {
      type: 'export'
      congregationId: number
      userId: number
      options: ExportOptions
    }
  | {
      type: 'import'
      congregationId: number
      userId: number
      storageKey: string
    }
