import { DynamicType } from '~/features/display-board/model/dynamic-document.type'

type DynamicData = { type: string; events?: { id: number }[] } | null

export interface FilteredDynamicData<T extends DynamicData> {
  data: T
  /**
   * True when the caller asked for one event and this document does not hold
   * it — a past event, or one whose programme was never released here.
   */
  requestedEventMissing: boolean
}

/**
 * Narrows a Programme document down to the single event a deep link asked for.
 *
 * When the event is absent the whole programme is still returned, because a
 * document with the wrong event is more useful than a blank page — but the
 * caller is told, so it can say why rather than leave the reader hunting a
 * list for something that is not in it.
 *
 * Pure, so the viewer route stays thin and this stays testable.
 */
export function filterDynamicDataToEvent<T extends DynamicData>(
  data: T,
  eventId: number | null,
): FilteredDynamicData<T> {
  if (data == null || eventId == null) return { data, requestedEventMissing: false }
  if (data.type !== DynamicType.Programme) return { data, requestedEventMissing: false }

  const match = data.events?.find(e => e.id === eventId)
  if (!match) return { data, requestedEventMissing: true }

  return { data: { ...data, events: [match] } as T, requestedEventMissing: false }
}
