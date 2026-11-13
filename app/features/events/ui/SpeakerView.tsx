import { DateChip, FactList, Status } from '@unitae/ui'
import { Mail, MessageSquare, Phone, Trash2, Undo2 } from 'lucide-react'
import { Link } from 'react-router'
import type {
  DirectoryCongregation,
  DirectorySpeaker,
  SpeakerVisits,
} from '~/features/events/model/external-speaker.type'
import { formatSpeakerDate, formatVisitDay } from '~/features/events/model/speaker-dates'
import { isIncomplete } from '~/features/events/model/speaker-directory'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { formatEventDate } from '~/shared/utils/event-time'
import { PanelSection } from './DirectoryPanelFrame'

// A speaker's sheet as read in the panel: how to reach him, his talks, his visits here, and for a retired one the
// two ways out. The panel around it adds « Modifier » and the « … » menu.

const ACTION =
  'border-border bg-card flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-sm font-medium'

/** On a phone, the three ways to reach him first, as on a publisher's record. */
function ReachActions({ speaker }: { speaker: DirectorySpeaker }) {
  const phone = (speaker.phone ?? speaker.phone2)?.replaceAll(' ', '')
  const email = speaker.email ?? speaker.email2
  const actions = [
    { label: m.external_speakers_call(), icon: Phone, href: phone ? `tel:${phone}` : null },
    { label: m.external_speakers_message(), icon: MessageSquare, href: phone ? `sms:${phone}` : null },
    { label: m.external_speakers_mail(), icon: Mail, href: email ? `mailto:${email}` : null },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(({ label, icon: Icon, href }) =>
        href ? (
          <a key={label} href={href} className={ACTION}>
            <Icon aria-hidden="true" className="text-brand-text size-[18px]" />
            {label}
          </a>
        ) : (
          <span key={label} aria-disabled="true" className={`${ACTION} text-faint`}>
            <Icon aria-hidden="true" className="size-[18px]" />
            {label}
          </span>
        ),
      )}
    </div>
  )
}

function contactLinks(values: (string | null)[], scheme: 'tel' | 'mailto') {
  const present = values.filter((value): value is string => value != null && value !== '')
  if (present.length === 0) return null
  return (
    <span className="flex flex-col gap-0.5">
      {present.map(value => (
        <a key={value} href={`${scheme}:${value.replaceAll(' ', '')}`} className="hover:underline">
          {value}
        </a>
      ))}
    </span>
  )
}

export function SpeakerView({
  speaker,
  congregation,
  visits,
  timezone,
  canManage,
  onRestore,
  onDelete,
}: {
  speaker: DirectorySpeaker
  congregation: DirectoryCongregation | null
  visits: SpeakerVisits | null
  timezone: string
  canManage: boolean
  onRestore: () => void
  onDelete: () => void
}) {
  const count = (visits?.past.length ?? 0) + (visits?.upcoming.length ?? 0)
  return (
    <>
      {/* On a phone, first and outside the divided sections: hidden on a desktop, it must not count among them. */}
      <div className="pb-3.5 md:hidden">
        <ReachActions speaker={speaker} />
      </div>
      <div className="divide-border flex flex-col divide-y">
        {speaker.retiredAt != null && canManage && (
          <PanelSection>
            <p className="text-muted-foreground text-sm">
              {m.external_speakers_retired_explained({
                congregation: congregation?.name ?? m.external_speakers_group_none(),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onRestore}>
                <Undo2 aria-hidden="true" />
                {m.external_speakers_restore_action()}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-danger-text" onClick={onDelete}>
                <Trash2 aria-hidden="true" />
                {m.external_speakers_delete_action()}
              </Button>
            </div>
          </PanelSection>
        )}
        {isIncomplete(speaker) && speaker.retiredAt == null && (
          <PanelSection>
            <p className="bg-warning-soft rounded-md px-3 py-2.5 text-sm">
              {m.external_speakers_incomplete_warning()}
              {speaker.legacyCongregationName && (
                <span className="text-muted-foreground mt-1 block text-xs">
                  {m.external_speakers_legacy_congregation({ name: speaker.legacyCongregationName })}
                </span>
              )}
            </p>
          </PanelSection>
        )}
        <PanelSection>
          <FactList
            emptyLabel="—"
            facts={[
              { label: m.external_speakers_fact_phone(), value: contactLinks([speaker.phone, speaker.phone2], 'tel') },
              {
                label: m.external_speakers_fact_email(),
                value: contactLinks([speaker.email, speaker.email2], 'mailto'),
              },
              {
                label: m.external_speakers_fact_talks(),
                value:
                  speaker.talks.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {speaker.talks.map(talk => (
                        <span key={talk} className="bg-hover rounded-sm px-1.5 py-0.5 text-xs font-medium tabular-nums">
                          {talk}
                        </span>
                      ))}
                    </span>
                  ) : null,
              },
              ...(speaker.notes
                ? [
                    {
                      label: m.external_speakers_fact_notes(),
                      value: <span className="whitespace-pre-line">{speaker.notes}</span>,
                    },
                  ]
                : []),
            ]}
          />
        </PanelSection>
        <PanelSection
          title={m.external_speakers_visits_title()}
          aside={count === 0 ? undefined : m.external_speakers_visits({ count: count })}
        >
          {visits?.upcoming.map(visit => (
            <Link
              key={`u-${visit.eventId}`}
              to={`/programs/events/${visit.eventId}`}
              className="hover:bg-hover -mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1 text-sm"
            >
              <DateChip
                month={formatEventDate(visit.date, timezone, getLocale(), { month: 'short' })}
                day={formatEventDate(visit.date, timezone, getLocale(), { day: 'numeric' })}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{visit.topic || visit.partName}</span>
                <span className="text-faint text-xs tabular-nums">{formatVisitDay(visit.date, timezone)}</span>
              </span>
              <Status tone={visit.status === 'draft' ? 'warning' : 'success'}>
                {visit.status === 'draft' ? m.external_speakers_status_draft() : m.external_speakers_status_released()}
              </Status>
            </Link>
          ))}
          {visits?.past.map(visit => (
            <div key={`p-${visit.eventId}`} className="text-muted-foreground flex items-baseline gap-2.5 text-sm">
              <span className="text-faint w-24 flex-none tabular-nums">{formatSpeakerDate(visit.date, timezone)}</span>
              <span className="truncate">{visit.topic || visit.partName}</span>
            </div>
          ))}
          {count === 0 && <p className="text-muted-foreground text-sm">{m.external_speakers_never_here()}</p>}
        </PanelSection>
        {congregation?.listDate && (
          <PanelSection>
            <p className="text-faint text-xs">
              {m.external_speakers_on_list_of({
                congregation: congregation.name,
                date: formatSpeakerDate(congregation.listDate, timezone),
              })}
            </p>
          </PanelSection>
        )}
      </div>
    </>
  )
}
