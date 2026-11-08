import { useCallback, useEffect } from 'react'
import { useFetcher } from 'react-router'
import { describeCandidate } from '~/features/events/model/person-facts'
import type { PersonDescription } from '~/shared/ui/PersonDropdown'

interface SlotCandidateFacts {
  lastAssignedAt: Record<number, string>
  absences: Record<number, { startDate: string; endDate: string }>
  elsewhere: Record<number, string[]>
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
}

/**
 * The facts of every person for one slot, loaded once when the editor opens, as the `describe` of the person
 * list: who last held it and when, who is away, who already does something else at the event. Until they arrive
 * the list stays plain.
 */
export function useCandidateFacts({ eventId, slot, timeZone, referenceYear, enabled = true }: Options) {
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
  return useCallback(
    (id: number): PersonDescription | undefined => {
      if (facts == null) return undefined
      return describeCandidate(
        { lastAssignedAt: facts.lastAssignedAt[id], absence: facts.absences[id], elsewhere: facts.elsewhere[id] },
        { kind: slot.kind, timeZone, referenceYear },
      )
    },
    [facts, slot.kind, timeZone, referenceYear],
  )
}
