import { useCallback, useEffect } from 'react'
import { useFetcher } from 'react-router'
import { describeCandidate, describeExternalCandidate } from '~/features/events/model/person-facts'
import type { PersonDescription } from '~/shared/ui/PersonDropdown'

interface SlotCandidateFacts {
  lastAssignedAt: Record<number, string>
  absences: Record<number, { startDate: string; endDate: string }>
  elsewhere: Record<number, string[]>
  speakers: { lastAssignedAt: Record<number, string>; elsewhere: Record<number, string[]> }
}

interface Options {
  eventId: number
  /** The slot: one of a part's two people, or a service. */
  slot:
    | { kind: 'part'; assignmentId: number; partSlot: 'assignee' | 'assistant' }
    | { kind: 'service'; assignmentId: number }
  timeZone: string
  referenceYear: number
  /** Off when the slot is not shown: nothing is loaded. */
  enabled?: boolean
  /** The external speakers who may take the slot, with their congregation (empty while their record is incomplete). */
  speakers?: { id: number; congregationName: string; talks: number[] }[]
}

/**
 * The facts of every person for one slot, loaded once when the editor opens, as the `describePerson` of the person
 * lists: who last held it and when, who is away, who already does something else at the event — for publishers,
 * and for external speakers on a part's main slot. Until they arrive the lists show names only.
 */
export function useCandidateFacts({ eventId, slot, timeZone, referenceYear, enabled = true, speakers }: Options) {
  const fetcher = useFetcher<SlotCandidateFacts | null>()
  const query =
    slot.kind === 'part'
      ? `partAssignmentId=${slot.assignmentId}&slot=${slot.partSlot}`
      : `serviceAssignmentId=${slot.assignmentId}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher.load is stable, adding it causes infinite loop
  useEffect(() => {
    if (enabled) fetcher.load(`/programs/events/${eventId}/candidate-facts?${query}`)
  }, [eventId, query, enabled])

  const facts = fetcher.data
  const describeMember = useCallback(
    (id: number): PersonDescription | undefined => {
      if (facts == null) return undefined
      return describeCandidate(
        { lastAssignedAt: facts.lastAssignedAt[id], absence: facts.absences[id], elsewhere: facts.elsewhere[id] },
        { kind: slot.kind, timeZone, referenceYear },
      )
    },
    [facts, slot.kind, timeZone, referenceYear],
  )
  const describeSpeaker = useCallback(
    (id: number): PersonDescription | undefined => {
      const speaker = speakers?.find(candidate => candidate.id === id)
      if (facts == null || speaker == null) return undefined
      return describeExternalCandidate(
        {
          congregationName: speaker.congregationName,
          talks: speaker.talks,
          lastAssignedAt: facts.speakers.lastAssignedAt[id],
          elsewhere: facts.speakers.elsewhere[id],
        },
        { timeZone, referenceYear },
      )
    },
    [facts, speakers, timeZone, referenceYear],
  )
  return { describeMember, describeSpeaker }
}
