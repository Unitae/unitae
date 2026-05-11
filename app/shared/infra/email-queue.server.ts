import { Queue } from 'bullmq'
import { QUEUE_NAMES } from '~/shared/infra/queues.server'
import { getBullMQConnection } from '~/shared/infra/redis.server'

export const emailQueue = new Queue(QUEUE_NAMES.email, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 10,
    removeOnFail: 20,
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
