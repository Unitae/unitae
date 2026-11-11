import type { OurListRecipient, OurSpeakerListPage } from '~/features/events/model/our-speaker.type'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { createLogger } from '~/shared/infra/logger.server'
import { sendEmail } from '~/shared/infra/mailer.server'
import { renderOurSpeakerListPdf } from './our-speaker-list-pdf.server'

// Sends « Notre liste » by e-mail: one message per chosen congregation, to its public talk coordinator, so none sees
// the others' addresses. What goes out is exactly what the send dialog shows: our sender, replies to our public talk
// coordinator, their coordinator in copy when asked, the subject and message as typed, the PDF attached.
//
// It holds no transaction: the caller reads the page in one, sends, then records what went in another, so a slow mail
// provider never keeps a database connection waiting. The sends go one after the other, spaced out, to stay under the
// provider's rate limit; a congregation's list is a handful of e-mails, sent a few times a year.

const logger = createLogger('our-speaker-list')

/** Under Resend's two requests a second. */
const SEND_SPACING_MS = 600

export interface OurListEmail {
  speakerCongregationIds: number[]
  copyCoordinators: boolean
  subject: string
  message: string
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function sendOurSpeakerList(
  page: OurSpeakerListPage,
  congregation: Pick<CongregationInfo, 'displayName' | 'timezone' | 'locale' | 'emailFrom'>,
  email: OurListEmail,
  options: { now?: Date; spacingMs?: number } = {},
): Promise<{ sent: OurListRecipient[]; failed: OurListRecipient[] }> {
  if (!page.brothers.some(brother => brother.onList)) throw new ConflictError('Nobody is on our list yet')
  const chosen = new Set(email.speakerCongregationIds)
  const recipients = page.recipients.filter(
    recipient => chosen.has(recipient.speakerCongregationId) && recipient.responsibleEmail.trim() !== '',
  )
  if (recipients.length === 0) return { sent: [], failed: [] }

  const { filename, content } = await renderOurSpeakerListPdf(page, {
    congregationName: congregation.displayName,
    timezone: congregation.timezone,
    locale: congregation.locale,
    now: options.now ?? new Date(),
  })
  const replyTo = page.header.responsible?.email.trim() || undefined
  const spacing = options.spacingMs ?? SEND_SPACING_MS

  const sent: OurListRecipient[] = []
  const failed: OurListRecipient[] = []
  for (const [index, recipient] of recipients.entries()) {
    if (index > 0 && spacing > 0) await pause(spacing)
    const coordinator = recipient.coordinatorEmail.trim()
    try {
      await sendEmail({
        from: congregation.emailFrom,
        to: [recipient.responsibleEmail.trim()],
        cc: email.copyCoordinators && coordinator !== '' ? [coordinator] : undefined,
        replyTo,
        subject: email.subject,
        text: email.message,
        attachments: [{ filename, content }],
      })
      sent.push(recipient)
    } catch (error) {
      logger.warn('Our speaker list could not be sent to a congregation', {
        speakerCongregationId: recipient.speakerCongregationId,
        error,
      })
      failed.push(recipient)
    }
  }
  return { sent, failed }
}
