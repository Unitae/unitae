/**
 * Where a board document stands, from its display window: the same rule the board applies when it
 * lists what is shown now (from its start, through its end).
 */
export type DisplayState =
  | { kind: 'unpublished' }
  | { kind: 'scheduled'; from: Date }
  | { kind: 'shown'; until: Date | null }
  | { kind: 'expired'; until: Date }

export function displayState({
  visibleFrom,
  visibleUntil,
  now,
}: {
  visibleFrom: Date | null
  visibleUntil: Date | null
  now: Date
}): DisplayState {
  if (visibleFrom === null) return { kind: 'unpublished' }
  if (visibleFrom > now) return { kind: 'scheduled', from: visibleFrom }
  if (visibleUntil !== null && visibleUntil < now) return { kind: 'expired', until: visibleUntil }
  return { kind: 'shown', until: visibleUntil }
}
