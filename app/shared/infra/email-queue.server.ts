import { Queue } from 'bullmq'
import {
  EMAIL_QUEUE_ATTEMPTS,
  EMAIL_QUEUE_BACKOFF_MS,
  EMAIL_QUEUE_REMOVE_ON_COMPLETE,
  EMAIL_QUEUE_REMOVE_ON_FAIL,
} from '~/shared/constants/queue-delays'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const emailQueue = new Queue(QUEUE_NAMES.email, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: EMAIL_QUEUE_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: EMAIL_QUEUE_BACKOFF_MS,
    },
    removeOnComplete: EMAIL_QUEUE_REMOVE_ON_COMPLETE,
    removeOnFail: EMAIL_QUEUE_REMOVE_ON_FAIL,
  },
})

export type EmailJobData =
  | { type: 'new-document-notification'; congregationId: number; documentId: number }
  | {
      type: 'documents-expiring'
      congregationId: number
      documents: { id: number; title: string }[]
      validatorEmail: string
      validatorFirstname?: string
      emailFrom: string
      baseUrl: string
      displayName: string
      locale: string
    }
  | {
      type: 'notification-digest'
      congregationId: number
      recipientId: number
      events: Array<{ type: string; entityType: string; entityId: number; payload: string }>
      notificationEventIds: number[]
    }
  | {
      type: 'notification-instant'
      congregationId: number
      notificationType: string
      recipientId: number | null
      recipientRole: string | null
      payload: string
    }
