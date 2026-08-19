import { notificationRecipientFilter } from '~/shared/auth/permissions.server'
import { type CongregationInfo, resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import type { EmailJobData } from '~/shared/infra/email-queue.server'
import { createLogger } from '~/shared/infra/logger.server'
import { sendEmail } from '~/shared/infra/mailer.server'
import { displayFirstname } from '~/shared/utils/display-name'
import { runInWorkerContext } from '~/shared/utils/worker-locale.server'
import { NOTIFICATION_TYPES } from './notification-types.server'
import { renderNotificationEmail } from './render-notification-email.server'
import { isNotificationDisabledForUser, resolveRecipients } from './resolve-recipients.server'

const logger = createLogger('notification-email')

// Return value of the per-event send loop.
// - `delivered`: sendEmail returned successfully, OR the send was a
//   deliberate no-op (recipient not found, preference disabled). The DB row
//   keeps its current status.
// - `permanent-failure`: the render layer refused to emit (unregistered type
//   or Zod-invalid payload). The digest tracks these ids and flips their DB
//   row to `status: 'failed'`. Callers ALSO coerce transient mailer failures
//   to this value from their catch blocks — semantically they're different
//   (render vs. delivery) but both need the row flipped and are logged with
//   distinct messages, so tracking one shared value keeps the return type
//   narrow. Transient mailer failures propagate out of sendNotificationToUser
//   as thrown errors; each caller decides whether to re-throw (single-
//   recipient path, safe to retry) or catch-and-log (multi-recipient path,
//   avoid re-mailing successes).
type EventSendResult = 'delivered' | 'permanent-failure'

// Delivery semantics: a digest is a batch of events pre-marked `sent` by
// flush-settled. Successful sends require no DB write. Render failures and
// transient mailer failures are caught per-event and flipped to `failed` so
// the row survives inside the 30-day cleanup window and shows up in ops
// queries against `status: 'failed'`. There is no automatic retry for
// `failed` rows — recovery is manual today (see notifications.md follow-up
// on resend tooling). The send LOOP itself never throws; the trailing
// updateMany can throw (DB blip) and would trigger a BullMQ retry, but by
// then all sends have already happened, so this is the one uncovered edge.
export async function handleDigestEmail(data: Extract<EmailJobData, { type: 'notification-digest' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)
  if (congregation.suspendedAt) {
    // Suspended tenants must not send email. Rows stay in whatever status
    // flush-settled set them to — suspension is an account-level gate, not a
    // delivery failure. If replayability on reinstatement matters, add a
    // dedicated `suppressed` status; not needed today.
    logger.info('Digest suppressed: congregation is suspended', {
      congregationId: data.congregationId,
      suspendedAt: congregation.suspendedAt,
      events: data.events.length,
    })
    return
  }

  const failedEventIds: number[] = []

  await runInWorkerContext(congregation.locale, congregation.timezone, async () => {
    for (let i = 0; i < data.events.length; i++) {
      const event = data.events[i]
      let result: EventSendResult
      try {
        result = await sendEventEmail(event, data.recipientId, congregation, data.congregationId)
      } catch (error) {
        // Transient mailer failure. Do NOT re-throw — the retry would re-mail
        // events earlier in this loop that already reached Resend. Mark this
        // specific event `failed` so it stays queryable in ops until cleanup
        // deletes it at 30 days.
        logger.error('Digest event failed transiently — marking failed', {
          notificationType: event.type,
          entityType: event.entityType,
          entityId: event.entityId,
          recipientId: data.recipientId,
          congregationId: data.congregationId,
          error,
        })
        result = 'permanent-failure'
      }
      if (result === 'permanent-failure') {
        const eventId = data.notificationEventIds[i]
        if (typeof eventId === 'number') failedEventIds.push(eventId)
      }
    }
  })

  // flush-settled marked every event `sent` before this job ran. Override
  // the specific subset that couldn't render (or transiently failed) to
  // `failed`. Successful events keep the `sent` status — no redundant re-mark.
  if (failedEventIds.length > 0) {
    await unscopedDb.notificationEvent.updateMany({
      where: { id: { in: failedEventIds } },
      data: { status: 'failed', processedAt: new Date() },
    })
  }
}

export async function handleInstantEmail(data: Extract<EmailJobData, { type: 'notification-instant' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)
  if (congregation.suspendedAt) {
    // Same account-level gate as handleDigestEmail. No DB row exists for
    // instant notifications (they bypass NotificationEvent) — nothing to
    // replay on reinstatement, so the digest's `suppressed`-status
    // consideration doesn't apply here.
    logger.info('Instant notification suppressed: congregation is suspended', {
      congregationId: data.congregationId,
      notificationType: data.notificationType,
      suspendedAt: congregation.suspendedAt,
    })
    return
  }

  await runInWorkerContext(congregation.locale, congregation.timezone, async () => {
    if (data.recipientRole) {
      await sendInstantToRole(data, data.recipientRole, congregation)
    } else if (data.recipientId) {
      await sendInstantToUser(data, data.recipientId, congregation)
    }
  })
}

// Role fan-out: per-recipient try/catch so one transient mailer failure does
// not abort the fan-out and trigger a BullMQ retry that re-mails the earlier
// (successful) recipients. Instant notifications leave no DB row, so the
// per-recipient error log is the only trace.
async function sendInstantToRole(
  data: Extract<EmailJobData, { type: 'notification-instant' }>,
  recipientRole: string,
  congregation: CongregationInfo,
): Promise<void> {
  const recipients = await resolveRecipients(unscopedDb, data.congregationId, recipientRole, data.notificationType)

  for (const recipient of recipients) {
    try {
      await sendNotificationToUser(data.notificationType, data.payload, recipient, congregation)
    } catch (error) {
      logger.error('Instant notification failed transiently for recipient', {
        notificationType: data.notificationType,
        userId: recipient.userId,
        congregationId: data.congregationId,
        error,
      })
    }
  }
}

// Single-recipient path: lets transient mailer failures propagate so the
// BullMQ job-level retry (with backoff) re-attempts delivery. No duplicate
// risk because there is exactly one recipient per job attempt.
async function sendInstantToUser(
  data: Extract<EmailJobData, { type: 'notification-instant' }>,
  recipientId: number,
  congregation: CongregationInfo,
): Promise<void> {
  const user = await unscopedDb.userAccount.findFirst({
    where: { id: recipientId, congregationId: data.congregationId, ...notificationRecipientFilter },
    select: { id: true, email: true, firstname: true, member: { select: { firstname: true } } },
  })

  if (!user) {
    // Deactivated, deleted, or cross-congregation — no delivery target. Warn
    // (not debug) so an operator can distinguish this from a queue drop when
    // investigating "why didn't user X get their notification".
    logger.warn('Instant notification skipped: recipient not found or inactive', {
      notificationType: data.notificationType,
      recipientId,
      congregationId: data.congregationId,
    })
    return
  }

  // Same preference filter the role branch applies via resolveRecipients —
  // without it, the /notifications/preferences toggles are decorative for
  // any type using the entity-user recipient strategy.
  const disabled = await isNotificationDisabledForUser(unscopedDb, user.id, data.congregationId, data.notificationType)
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
      try {
        const status = await sendNotificationToUser(event.type, event.payload, recipient, congregation)
        if (status === 'permanent-failure') result = 'permanent-failure'
      } catch (error) {
        // Per-recipient catch mirrors the instant role-fan-out. One recipient's
        // transient mailer failure must not abort the fan-out — the earlier
        // recipients already received the email, and the caller can't undo
        // that even if we throw. Log and continue; the surrounding digest
        // loop still records a per-event failure through the result flag.
        logger.error('Digest role-fanout: mailer failed for recipient', {
          notificationType: event.type,
          userId: recipient.userId,
          congregationId,
          error,
        })
        result = 'permanent-failure'
      }
    }
    return result
  }

  const user = await unscopedDb.userAccount.findFirst({
    where: { id: recipientId, congregationId, ...notificationRecipientFilter },
    select: { id: true, email: true, firstname: true, member: { select: { firstname: true } } },
  })

  if (!user) {
    // Recipient was deactivated/deleted between flush-settled and the digest
    // job firing. Not a render failure — no row flip — but worth a warn so
    // this is distinguishable from a delivery no-op.
    logger.warn('Digest event skipped: recipient not found or inactive', {
      notificationType: event.type,
      recipientId,
      congregationId,
    })
    return 'delivered'
  }

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

  // Transient mailer failures propagate; callers decide how to react. The
  // single-recipient instant path re-throws to trigger a BullMQ retry with
  // backoff; the multi-recipient digest and role-fan-out paths catch here
  // to avoid re-mailing recipients that already succeeded on retry.
  await sendEmail({ to: recipient.email, from: congregation.emailFrom, subject, react })

  return 'delivered'
}
