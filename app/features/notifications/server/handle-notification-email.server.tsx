import NewDocumentInBoard from '~/features/notifications/emails/new-document-in-board'
import * as m from '~/i18n/paraglide/messages'
import { type CongregationInfo, resolveCongregation } from '~/shared/domain/congregation.server'
import { unscopedDb } from '~/shared/infra/db.server'
import type { EmailJobData } from '~/shared/infra/email-queue.server'
import { createLogger } from '~/shared/infra/logger.server'
import { mailer } from '~/shared/infra/mailer.server'
import { runWithLocale } from '~/shared/utils/worker-locale.server'
import { boardDocumentCreatedPayloadSchema } from '../schemas/notification-payload.schema'
import { resolveRecipients } from './resolve-recipients.server'

const logger = createLogger('notification-email')

export async function handleDigestEmail(data: Extract<EmailJobData, { type: 'notification-digest' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)

  await runWithLocale(congregation.locale, async () => {
    // Group events by type family for rendering
    for (const event of data.events) {
      await sendEventEmail(event, data.recipientId, congregation, data.congregationId)
    }
  })

  // Mark notification events as sent (they were already marked in flush-settled, but update if needed)
  if (data.notificationEventIds.length > 0) {
    await unscopedDb.notificationEvent.updateMany({
      where: { id: { in: data.notificationEventIds } },
      data: { status: 'sent', processedAt: new Date() },
    })
  }
}

export async function handleInstantEmail(data: Extract<EmailJobData, { type: 'notification-instant' }>): Promise<void> {
  const congregation = await resolveCongregation(data.congregationId)

  await runWithLocale(congregation.locale, async () => {
    if (data.recipientRole) {
      // Resolve role to users
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
        select: { id: true, email: true, firstname: true },
      })

      if (user) {
        await sendNotificationToUser(
          data.notificationType,
          data.payload,
          { userId: user.id, email: user.email, firstname: user.firstname },
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
): Promise<void> {
  // For digest events resolved by role, we need to resolve recipients
  if (recipientId === 0) {
    // recipientId=0 means resolve by role — this happens for role-based debounced notifications
    const config = await import('./notification-types.server').then(m => m.NOTIFICATION_TYPES[event.type])
    if (config && 'recipientRole' in config && config.recipientRole) {
      const recipients = await resolveRecipients(unscopedDb, congregationId, config.recipientRole, event.type)
      for (const recipient of recipients) {
        await sendNotificationToUser(event.type, event.payload, recipient, congregation)
      }
      return
    }
  }

  // Direct recipient
  const user = await unscopedDb.userAccount.findFirst({
    where: { id: recipientId, congregationId, active: true },
    select: { id: true, email: true, firstname: true },
  })

  if (user) {
    await sendNotificationToUser(
      event.type,
      event.payload,
      { userId: user.id, email: user.email, firstname: user.firstname },
      congregation,
    )
  }
}

async function sendNotificationToUser(
  notificationType: string,
  payloadJson: string,
  recipient: { userId: number; email: string; firstname: string | null },
  congregation: CongregationInfo,
): Promise<void> {
  try {
    const payload = JSON.parse(payloadJson)
    const { subject, react } = renderNotificationEmail(notificationType, payload, recipient, congregation)

    if (!react) {
      logger.warn('No email template for notification type', { notificationType })
      return
    }

    await mailer.emails.send({
      to: recipient.email,
      from: congregation.emailFrom,
      subject,
      react,
    })
  } catch (error) {
    logger.error('Failed to send notification email', {
      notificationType,
      userId: recipient.userId,
      error,
    })
  }
}

function renderNotificationEmail(
  notificationType: string,
  payload: unknown,
  recipient: { email: string; firstname: string | null },
  congregation: CongregationInfo,
): { subject: string; react: React.ReactNode | null } {
  switch (notificationType) {
    case 'board.document.created': {
      const parsed = boardDocumentCreatedPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        logger.warn('Invalid payload for board.document.created', { payload, error: parsed.error.message })
        return { subject: '', react: null }
      }
      return {
        subject: m.email_board_new_document_subject(),
        react: (
          <NewDocumentInBoard
            email={recipient.email}
            firstname={recipient.firstname ?? undefined}
            filename={parsed.data.title}
            documentId={parsed.data.documentId}
            baseUrl={congregation.baseUrl}
            platformName={congregation.displayName}
          />
        ),
      }
    }
    case 'board.document.deleted':
      return {
        subject: m.email_board_new_document_subject(),
        react: null, // No template yet — will be added in follow-up PR
      }
    default:
      return { subject: '', react: null }
  }
}
