import { Status, Tag } from '@unitae/ui'
import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import type { CadencePayload, PartSlot } from '~/features/events/model/cadence.type'
import { formatAbsenceRange, rotationSentence } from '~/features/events/model/person-facts'
import { computeCadenceWarnings } from '~/features/events/ui/compute-cadence-warnings'
import { RotationPanel } from '~/features/events/ui/RotationPanel'
import * as m from '~/i18n/paraglide/messages'

interface PublisherInfoData {
  profile: {
    id: number
    firstname: string | null
    lastname: string | null
    isHelder: boolean
    isServant: boolean
    group: string | null
  }
  daysOff: { startDate: string; endDate: string }[]
  sameEventAssignments: { type: 'part' | 'service'; name: string; section?: string }[]
  cadence: CadencePayload
}

interface PersonFactsProps {
  eventId: number
  userId: string | null
  // The assignment being edited: the anchor of the rotation, and left out of « déjà sur cet évènement ».
  excludePartAssignmentId?: number | null
  excludeServiceAssignmentId?: number | null
  partSlot?: PartSlot
  timeZone: string
  /** The event's year: dates in it go without theirs. */
  referenceYear: number
}

export type FactLine = { tone: 'warning' | 'danger'; text: string }

/** The lines that call for attention, worst first; the « aucune absence » line stands in when there are none. */
export function FactLines({ lines, ok }: { lines: FactLine[]; ok?: string }) {
  if (lines.length === 0) {
    return ok ? (
      <Status tone="success" className="whitespace-normal text-foreground">
        {ok}
      </Status>
    ) : null
  }
  return (
    <>
      {lines.map(line => (
        <Status key={line.text} tone={line.tone} className="items-start whitespace-normal text-foreground [&>svg]:mt-1">
          {line.text}
        </Status>
      ))}
    </>
  )
}

/** Two grey lines while the facts load, rather than a skeleton card. */
export function FactsLoading() {
  return (
    <div role="status" className="flex flex-col gap-2 py-0.5">
      <span className="sr-only">{m.person_facts_loading()}</span>
      <span aria-hidden="true" className="h-2.5 w-3/5 rounded bg-hover" />
      <span aria-hidden="true" className="h-2.5 w-2/5 rounded bg-hover" />
    </div>
  )
}

/**
 * What matters about the person picked for a slot, under the field: what blocks or warns first, then who they are
 * in the congregation, then their turns on this slot. No card and no name: the field above already shows it.
 */
export function PersonFacts({
  eventId,
  userId,
  excludePartAssignmentId,
  excludeServiceAssignmentId,
  partSlot,
  timeZone,
  referenceYear,
}: PersonFactsProps) {
  const fetcher = useFetcher<PublisherInfoData>()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (!userId || userId === 'none') return
    const searchParams = new URLSearchParams({ userId })
    if (excludePartAssignmentId != null) searchParams.set('excludePartAssignmentId', String(excludePartAssignmentId))
    if (excludeServiceAssignmentId != null) {
      searchParams.set('excludeServiceAssignmentId', String(excludeServiceAssignmentId))
    }
    if (partSlot) searchParams.set('partSlot', partSlot)
    fetcher.load(`/programs/events/${eventId}/publisher-info?${searchParams}`)
  }, [userId, eventId, excludePartAssignmentId, excludeServiceAssignmentId, partSlot])

  if (!userId || userId === 'none') return null
  if (fetcher.state === 'loading') return <FactsLoading />

  const data = fetcher.data
  if (!data?.profile) return null
  const { profile, daysOff, sameEventAssignments, cadence } = data

  const warnings = cadence.anchored ? computeCadenceWarnings(cadence) : null
  const previousTime = cadence.past.at(-1)?.assigned === true
  const lines: FactLine[] = [
    ...daysOff.map(dayOff => ({
      tone: 'danger' as const,
      text: m.person_facts_absence({ range: formatAbsenceRange(dayOff.startDate, dayOff.endDate, referenceYear) }),
    })),
    ...(sameEventAssignments.length > 0
      ? [
          {
            tone: 'warning' as const,
            text: m.person_facts_elsewhere({
              names: sameEventAssignments.map(assignment => assignment.name).join(', '),
            }),
          },
        ]
      : []),
    ...(warnings?.consecutive
      ? [{ tone: 'warning' as const, text: previousTime ? m.person_facts_previous_time() : m.person_facts_next_time() }]
      : []),
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
  const tags = [
    profile.group,
    profile.isHelder ? m.publisher_info_elder_badge() : null,
    profile.isServant ? m.publisher_info_servant_badge() : null,
  ].filter((tag): tag is string => tag != null)

  return (
    <div className="flex flex-col gap-2">
      <FactLines lines={lines} ok={m.person_facts_no_absence()} />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
      {cadence.anchored && (
        <RotationPanel
          label={excludeServiceAssignmentId != null ? m.person_facts_on_service() : m.person_facts_on_part()}
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
    </div>
  )
}
