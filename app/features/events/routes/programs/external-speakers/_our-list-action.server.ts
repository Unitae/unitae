import type { OurSpeakerIntent } from '~/features/events/schemas/our-speaker.schema'
import { getOurSpeakerListPage } from '~/features/events/server/our-speakers.queries'
import { markOurListSent, updateOurSpeaker } from '~/features/events/server/our-speakers.server'
import { sendOurSpeakerList } from '~/features/events/server/send-our-speaker-list.server'
import * as m from '~/i18n/paraglide/messages'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { isEmailConfigured } from '~/shared/infra/mailer.server'
import { combineLocalDateTime, formatDateForInput } from '~/shared/utils/event-time'

// Every change on « Notre liste », made through a fetcher: a toast says what happened, and a refusal comes back to the
// dialog or the panel that asked. Each one opens its own transactions through `withScope`, so sending can keep the
// e-mails out of them: read the list in one, send, record what went in another.

export type OurListOutcome =
  | { ok: true; message: string; extra?: Record<string, unknown> }
  | { ok: false; status: number; error: string }

interface OurListContext {
  actorId: number
  congregation: Pick<CongregationInfo, 'displayName' | 'timezone' | 'locale' | 'emailFrom'>
  withScope: <T>(fn: (db: TransactionClient, congregationId: number) => Promise<T>) => Promise<T>
}

const refused = (error: string, status: number): OurListOutcome => ({ ok: false, status, error })

/** The day picked in « Marquer envoyée », as a moment: now for today, so a change made this morning counts as sent. */
function sentAtOf(sentOn: string, timezone: string): Date {
  const now = new Date()
  if (sentOn >= formatDateForInput(now, timezone)) return now
  return combineLocalDateTime(sentOn, '12:00', timezone)
}

async function send(intent: Extract<OurSpeakerIntent, { intent: 'send' }>, context: OurListContext) {
  if (!isEmailConfigured()) return refused(m.external_speakers_send_unavailable(), 400)
  const page = await context.withScope((db, congregationId) => getOurSpeakerListPage(db, congregationId))
  let outcome: Awaited<ReturnType<typeof sendOurSpeakerList>>
  try {
    outcome = await sendOurSpeakerList(page, context.congregation, intent)
  } catch (error) {
    if (error instanceof ConflictError) return refused(m.external_speakers_ours_empty_on(), 409)
    throw error
  }
  const { sent, failed } = outcome
  if (sent.length === 0) return refused(m.external_speakers_send_failed(), 502)
  await context.withScope((db, congregationId) =>
    markOurListSent(db, congregationId, context.actorId, {
      speakerCongregationIds: sent.map(each => each.speakerCongregationId),
      sentAt: new Date(),
      manual: false,
      // The list that went, read before sending: a change made meanwhile leaves them out of date, as they are.
      digest: page.digest,
    }),
  )
  const message =
    failed.length > 0
      ? m.external_speakers_send_partial({ sent: String(sent.length), names: failed.map(each => each.name).join(', ') })
      : sent.length === 1
        ? m.external_speakers_send_done_one()
        : m.external_speakers_send_done_many({ count: String(sent.length) })
  return { ok: true as const, message, extra: { failed: failed.map(each => each.speakerCongregationId) } }
}

export async function runOurListIntent(intent: OurSpeakerIntent, context: OurListContext): Promise<OurListOutcome> {
  const { actorId } = context
  switch (intent.intent) {
    case 'brother-update': {
      const { intent: _, memberId, ...input } = intent
      try {
        await context.withScope((db, congregationId) => updateOurSpeaker(db, congregationId, actorId, memberId, input))
      } catch (error) {
        if (error instanceof ConflictError) return refused(m.external_speakers_ours_not_candidate(), 409)
        throw error
      }
      return { ok: true, message: m.external_speakers_ours_saved() }
    }
    case 'mark-sent': {
      // Marked sent from one's own mailbox: what they received is taken to be today's list.
      const count = await context.withScope(async (db, congregationId) => {
        const { digest } = await getOurSpeakerListPage(db, congregationId)
        return markOurListSent(db, congregationId, actorId, {
          speakerCongregationIds: intent.speakerCongregationIds,
          sentAt: sentAtOf(intent.sentOn, context.congregation.timezone),
          manual: true,
          digest,
        })
      })
      const message =
        count === 1 ? m.external_speakers_mark_done_one() : m.external_speakers_mark_done_many({ count: String(count) })
      return { ok: true, message }
    }
    case 'send':
      return send(intent, context)
  }
}
