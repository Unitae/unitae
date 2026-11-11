import { Panel, StatusIcon, type StatusTone } from '@unitae/ui'
import { Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { type SendState, sendState } from '~/features/events/model/our-speaker'
import type { OurListContact, OurListRecipient, OurSpeakerListPage } from '~/features/events/model/our-speaker.type'
import { formatSpeakerDate } from '~/features/events/model/speaker-dates'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { formatEventDate } from '~/shared/utils/event-time'

// Beside « Notre liste »: who is printed at its head, and where it went.

const SETTINGS = '/settings/external-speakers'

/** One person at the head of the list: what he is, who, how to reach him, where that comes from. */
function HeadEntry({ label, contact, source }: { label: string; contact: OurListContact | null; source: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 text-sm">
      <span className="text-faint text-xs">{label}</span>
      {contact ? (
        <>
          <span className="font-medium">{contact.name}</span>
          {contact.phone && <span className="text-muted-foreground tabular-nums">{contact.phone}</span>}
          {contact.email && <span className="text-muted-foreground break-all">{contact.email}</span>}
        </>
      ) : (
        <span className="text-muted-foreground">{m.external_speakers_ours_header_missing()}</span>
      )}
      <span className="text-faint mt-0.5 text-xs">{source}</span>
    </div>
  )
}

export function OurListHeaderCard({ page, canConfigure }: { page: OurSpeakerListPage; canConfigure: boolean }) {
  const { header, responsibleRole } = page
  const missing = canConfigure ? (
    <Link to={SETTINGS} className="text-primary hover:underline">
      {m.external_speakers_send_reply_to_missing()}
    </Link>
  ) : (
    m.external_speakers_send_reply_to_missing()
  )
  return (
    <Panel
      title={
        <span className="flex flex-col">
          {m.external_speakers_ours_header_title()}
          <span className="text-faint text-xs font-normal">{m.external_speakers_ours_header_hint()}</span>
        </span>
      }
    >
      <div className="divide-border divide-y">
        <HeadEntry
          label={m.external_speakers_coordinator()}
          contact={header.coordinator}
          source={m.external_speakers_ours_header_coordinator_from()}
        />
        <HeadEntry
          label={m.external_speakers_responsible()}
          contact={header.responsible}
          source={
            responsibleRole ? m.external_speakers_ours_header_responsible_from({ role: responsibleRole.name }) : missing
          }
        />
      </div>
    </Panel>
  )
}

const TONE: Record<SendState, StatusTone> = { never: 'neutral', changed: 'warning', 'up-to-date': 'success' }

/** The row's short words — the state and the day — and the full sentence for whoever points at it. */
function whenOf(recipient: OurListRecipient, timezone: string): { short: string; full: string } {
  if (recipient.sentAt == null) {
    return { short: m.external_speakers_ours_state_never(), full: m.external_speakers_ours_never_sent() }
  }
  const day = formatEventDate(recipient.sentAt, timezone, getLocale(), { day: 'numeric', month: 'short' })
  const date = formatSpeakerDate(recipient.sentAt, timezone)
  if (recipient.outdated) {
    return {
      short: m.external_speakers_ours_row_changed({ date: day }),
      full: m.external_speakers_ours_sent_changed({ date }),
    }
  }
  return {
    short: m.external_speakers_ours_row_up_to_date({ date: day }),
    full: recipient.sentManually
      ? m.external_speakers_ours_marked_up_to_date({ date })
      : m.external_speakers_ours_sent_up_to_date({ date }),
  }
}

const ORDER: Record<SendState, number> = { never: 0, changed: 0, 'up-to-date': 1 }

export function OurListSendsCard({
  recipients,
  timezone,
  canManage,
  onMarkSent,
  onSendOutdated,
}: {
  recipients: OurListRecipient[]
  timezone: string
  canManage: boolean
  onMarkSent: () => void
  onSendOutdated: () => void
}) {
  const outdated = recipients.filter(recipient => recipient.outdated).length
  return (
    <Panel
      title={
        <span className="flex flex-col">
          {m.external_speakers_ours_sends_title()}
          <span className="text-faint text-xs font-normal">
            {m.external_speakers_ours_sends_hint()}
            {outdated > 0 && ` · ${m.external_speakers_ours_sends_outdated({ count: String(outdated) })}`}
          </span>
        </span>
      }
      footer={
        canManage && recipients.length > 0 ? (
          <div className="flex w-full items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onMarkSent}>
              {m.external_speakers_ours_mark_sent()}
            </Button>
            <span className="flex-1" />
            {outdated > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={onSendOutdated}>
                <Send aria-hidden="true" />
                {m.external_speakers_ours_send_outdated()}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {recipients.length === 0 ? (
        <p className="text-muted-foreground px-4 py-3 text-sm">{m.external_speakers_ours_no_recipients()}</p>
      ) : (
        <ul>
          {/* What is left to send first, then the congregations already up to date. */}
          {[...recipients]
            .sort((a, b) => ORDER[sendState(a)] - ORDER[sendState(b)])
            .map(recipient => {
              const when = whenOf(recipient, timezone)
              return (
                <li
                  key={recipient.speakerCongregationId}
                  title={when.full}
                  className="border-border flex h-9 items-center gap-2.5 border-b px-4 text-sm last:border-b-0"
                >
                  <StatusIcon tone={TONE[sendState(recipient)]} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-medium">{recipient.name}</span>
                  <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">{when.short}</span>
                </li>
              )
            })}
        </ul>
      )}
    </Panel>
  )
}
