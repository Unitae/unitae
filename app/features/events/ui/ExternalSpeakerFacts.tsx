import { Mail, Phone } from 'lucide-react'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import type { CadencePayload } from '~/features/events/model/cadence.type'
import { formatFactDate, rotationSentence } from '~/features/events/model/person-facts'
import { computeCadenceWarnings } from '~/features/events/ui/compute-cadence-warnings'
import { type FactLine, FactLines, FactsLoading } from '~/features/events/ui/PersonFacts'
import { RotationPanel } from '~/features/events/ui/RotationPanel'
import * as m from '~/i18n/paraglide/messages'

interface ExternalSpeakerInfoData {
  profile: {
    id: number
    name: string
    congregationName: string
    phones: string[]
    emails: string[]
    talks: number[]
    notes: string | null
    isIncomplete: boolean
  }
  recentHistory: { date: string; partName: string; topic: string }[]
  cadence: CadencePayload
}

interface ExternalSpeakerFactsProps {
  eventId: number
  externalSpeakerId: string | null
  // The part being edited: the anchor of the rotation.
  excludePartAssignmentId?: number | null
  timeZone: string
  referenceYear: number
}

/**
 * The same grammar as a publisher's facts, with what is known of a visiting speaker: what is missing on their
 * record, their congregation and how to reach them, their turns on this part and their last visits.
 */
export function ExternalSpeakerFacts({
  eventId,
  externalSpeakerId,
  excludePartAssignmentId,
  timeZone,
  referenceYear,
}: ExternalSpeakerFactsProps) {
  const fetcher = useFetcher<ExternalSpeakerInfoData>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (!externalSpeakerId || externalSpeakerId === 'none') return
    const searchParams = new URLSearchParams({ externalSpeakerId })
    if (excludePartAssignmentId != null) searchParams.set('excludePartAssignmentId', String(excludePartAssignmentId))
    fetcher.load(`/programs/events/${eventId}/external-speaker-info?${searchParams}`)
  }, [externalSpeakerId, eventId, excludePartAssignmentId])

  if (!externalSpeakerId || externalSpeakerId === 'none') return null
  if (fetcher.state === 'loading') return <FactsLoading />

  const data = fetcher.data
  if (!data?.profile) return null
  const { profile, recentHistory, cadence } = data
  const warnings = cadence.anchored ? computeCadenceWarnings(cadence) : null
  const lines: FactLine[] = [
    ...(profile.isIncomplete ? [{ tone: 'warning' as const, text: m.person_facts_incomplete() }] : []),
    ...(warnings?.rotationConcern
      ? [
          {
            tone: 'warning' as const,
            text: m.person_facts_count({
              count: String(warnings.rotationConcern.assigned),
              total: String(warnings.rotationConcern.window),
            }),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-2">
      <FactLines lines={lines} />
      {profile.congregationName && <p className="text-muted-foreground text-sm">{profile.congregationName}</p>}
      {profile.talks.length > 0 && (
        <p className="text-muted-foreground text-sm tabular-nums">
          {m.person_facts_talks({ numbers: profile.talks.join(', ') })}
        </p>
      )}
      {profile.phones.map(phone => (
        <a
          key={phone}
          href={`tel:${phone.replaceAll(' ', '')}`}
          className="flex w-fit items-center gap-2 text-muted-foreground text-sm tabular-nums hover:text-foreground"
        >
          <Phone aria-hidden="true" className="size-3.5 text-faint" />
          {phone}
        </a>
      ))}
      {profile.emails.map(email => (
        <a
          key={email}
          href={`mailto:${email}`}
          className="flex w-fit items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        >
          <Mail aria-hidden="true" className="size-3.5 text-faint" />
          {email}
        </a>
      ))}
      {profile.notes && <p className="whitespace-pre-line text-faint text-sm">{profile.notes}</p>}
      {cadence.anchored && (
        <RotationPanel
          label={m.person_facts_on_part()}
          sentence={rotationSentence(cadence, {
            countWarned: warnings?.rotationConcern != null,
            timeZone,
            referenceYear,
          })}
          past={cadence.past}
          future={cadence.future}
          savedMatchesSelection={cadence.savedMatchesSelection}
          timeZone={timeZone}
        />
      )}
      {recentHistory.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-0.5 text-sm">
          <span className="font-medium text-muted-foreground">{m.person_facts_recent_visits()}</span>
          {recentHistory.slice(0, 3).map(visit => (
            <span key={visit.date} className="text-faint">
              {formatFactDate(visit.date, timeZone, referenceYear)}
              {visit.topic ? ` — « ${visit.topic} »` : ` — ${visit.partName}`}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
