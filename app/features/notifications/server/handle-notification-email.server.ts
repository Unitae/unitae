import { type CongregationInfo, resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import type { EmailJobData } from '~/shared/infra/email-queue.server'
import { createLogger } from '~/shared/infra/logger.server'
import { mailer } from '~/shared/infra/mailer.server'
import { displayFirstname } from '~/shared/utils/display-name'
import { runInWorkerContext } from '~/shared/utils/worker-locale.server'
import { NOTIFICATION_TYPES } from './notification-types.server'
import { renderNotificationEmail } from './render-notification-email.server'
import { isNotificationDisabledForUser, resolveRecipients } from './resolve-recipients.server'

const logger = createLogger('notification-email')

// Return value of the per-event send loop. `permanent-failure` indicates
// the render couldn't produce an email (unregistered type or invalid payload)
// — the digest tracks these ids and overrides them to `status: 'failed'` so
// the drift surfaces in the DB and cleanup can retain them for investigation.
// `delivered` means the render was viable and mailer.emails.send was attempted
// (transient SMTP failures are caught inside sendNotificationToUser).
type EventSendResult = 'delivered' | 'permanent-failure'

export async function handleDigestEmail(data: Extract<EmailJobData, { type: 'notification-digest' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)
  const failedEventIds: number[] = []

  await runInWorkerContext(congregation.locale, congregation.timezone, async () => {
    for (let i = 0; i < data.events.length; i++) {
      const event = data.events[i]
      const result = await sendEventEmail(event, data.recipientId, congregation, data.congregationId)
      if (result === 'permanent-failure') {
        const eventId = data.notificationEventIds[i]
        if (typeof eventId === 'number') failedEventIds.push(eventId)
      }
    }
  })

  // flush-settled marked every event `sent` before this job ran. Override
  // the specific subset that couldn't render to `failed`. Successful events
  // keep the `sent` status — no redundant re-mark.
  if (failedEventIds.length > 0) {
    await unscopedDb.notificationEvent.updateMany({
      where: { id: { in: failedEventIds } },
      data: { status: 'failed', processedAt: new Date() },
    })
  }
}

export async function handleInstantEmail(data: Extract<EmailJobData, { type: 'notification-instant' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)

  await runInWorkerContext(congregation.locale, congregation.timezone, async () => {
    if (data.recipientRole) {
      const recipients = await resolveRecipients(
        unscopedDb,
        data.congregationId,
        data.recipientRole,
        data.notificationType,
      )

      for (const recipient of recipients) {
        await sendNotificationToUser(data.notificationType, data.payload, recipient, congregation)
      }
    } else if (data.recipientId) {
      const user = await unscopedDb.userAccount.findFirst({
        where: { id: data.recipientId, congregationId: data.congregationId, active: true },
        select: { id: true, email: true, firstname: true, member: { select: { firstname: true } } },
      })

      if (user) {
        // Same preference filter the role branch applies via resolveRecipients.
        // Without this, the /notifications/preferences toggles are decorative
        // for any type using entity-user recipient strategy.
        const disabled = await isNotificationDisabledForUser(
          unscopedDb,
          user.id,
          data.congregationId,
          data.notificationType,
        )
        if (disabled) {
          logger.debug('Notification skipped: user disabled the type', {
            notificationType: data.notificationType,
            userId: user.id,
          })
          return
        }
        await sendNotificationToUser(
          data.notificationType,
          data.payload,
          { userId: user.id, email: user.email, firstname: displayFirstname(user) },
          congregation,
        )
      }
    }
  })
}

async function sendEventEmail(
  event: { type: string; entityType: string; entityId: number; payload: string },
  recipientId: number,
  congregation: CongregationInfo,
  congregationId: number,
): Promise<EventSendResult> {
  if (recipientId === 0) {
    // recipientId=0 means resolve by role — role-based debounced notifications.
    const config = NOTIFICATION_TYPES[event.type]
    if (!config || !('recipientRole' in config) || !config.recipientRole) {
      // Type is not registered (drift after a rename) or lacks a recipientRole:
      // no way to deliver. Permanent failure so the drift surfaces in the DB.
      logger.error('Digest event references unresolvable role config', { type: event.type })
      return 'permanent-failure'
    }
    const recipients = await resolveRecipients(unscopedDb, congregationId, config.recipientRole, event.type)
    // Empty recipient list is not a failure — the definition is valid, just
    // nobody eligible. `delivered` for accounting purposes.
    let result: EventSendResult = 'delivered'
    for (const recipient of recipients) {
      const status = await sendNotificationToUser(event.type, event.payload, recipient, congregation)
      if (status === 'permanent-failure') result = 'permanent-failure'
    }
    return result
  }

  const user = await unscopedDb.userAccount.findFirst({
    where: { id: recipientId, congregationId, active: true },
    select: { id: true, email: true, firstname: true, member: { select: { firstname: true } } },
  })

  if (!user) return 'delivered'

  // Apply the same preference filter as the role branch does upstream.
  const disabled = await isNotificationDisabledForUser(unscopedDb, user.id, congregationId, event.type)
  if (disabled) {
    logger.debug('Digest event skipped: user disabled the type', {
      notificationType: event.type,
      userId: user.id,
    })
    return 'delivered'
  }

  return await sendNotificationToUser(
    event.type,
    event.payload,
    { userId: user.id, email: user.email, firstname: displayFirstname(user) },
    congregation,
  )
}

async function sendNotificationToUser(
  notificationType: string,
  payloadJson: string,
  recipient: { userId: number; email: string; firstname: string | null },
  congregation: CongregationInfo,
): Promise<EventSendResult> {
  // Parse-and-render is the "permanent" surface: bad JSON, unregistered type,
  // or invalid payload can never deliver — surface as errors and mark the
  // event failed. A template callback throwing (`renderEmail: (ctx) => ...`
  // dereferencing a nullable field) is a programmer bug — it propagates to
  // BullMQ so the job goes red and the drift is visible.
  let payload: unknown
  try {
    payload = JSON.parse(payloadJson)
  } catch (error) {
    logger.error('Invalid JSON payload for notification', {
      notificationType,
      userId: recipient.userId,
      error,
    })
    return 'permanent-failure'
  }

  const { subject, react } = renderNotificationEmail(notificationType, payload, recipient, congregation)
  if (!react) {
    // Renderer returned null: either unregistered type or the payload failed
    // its Zod schema. Both mean drift between producer and definition.
    logger.error('No email template for notification type', { notificationType, userId: recipient.userId })
    return 'permanent-failure'
  }

  try {
    await mailer.emails.send({ to: recipient.email, from: congregation.emailFrom, subject, react })
  } catch (error) {
    // Transient SMTP failure — the render was viable; BullMQ's job-level
    // retry will re-attempt. Log at error level but don't fail the event.
    logger.error('Mailer send failed', { notificationType, userId: recipient.userId, error })
  }

  return 'delivered'
}
