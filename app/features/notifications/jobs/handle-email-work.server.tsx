import type { Job } from 'bullmq'
import type { EmailJobData } from '~/shared/infra/email-queue.server'

export function handleEmailWork(job: Job<EmailJobData>): Promise<void> {
  if (job.data.type === 'notification-digest') return handleNotificationDigest(job.data)
  return handleNotificationInstant(job.data)
}

async function handleNotificationDigest(data: Extract<EmailJobData, { type: 'notification-digest' }>) {
  const { handleDigestEmail } = await import('../server/handle-notification-email.server')
  return handleDigestEmail(data)
}

async function handleNotificationInstant(data: Extract<EmailJobData, { type: 'notification-instant' }>) {
  const { handleInstantEmail } = await import('../server/handle-notification-email.server')
  return handleInstantEmail(data)
}
