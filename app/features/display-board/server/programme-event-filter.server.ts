import { DynamicType } from '~/features/display-board/model/dynamic-document.type'

// Narrows a Programme dynamic document's events array down to a single event
// when the viewer was deep-linked with ?eventId=. Returns the input untouched
// when no filter is requested, when the id is absent from the current list
// (past event / re-templated), or when the data is not a Programme.
//
// Kept as a pure function so the viewer route stays thin and this behavior
// is testable in isolation.
type DynamicData = { type: string; events?: { id: number }[] } | null

export function filterDynamicDataToEvent<T extends DynamicData>(data: T, eventId: number | null): T {
  if (data == null || eventId == null) return data
  if (data.type !== DynamicType.Programme) return data
  if (!data.events || data.events.length === 0) return data

  const match = data.events.find(e => e.id === eventId)
  if (!match) return data

  return { ...data, events: [match] } as T
}
