// What a map frame shows over its map: loading, the map itself, or « Le fond de carte ne répond pas ». Shared by the
// territory maps on MapLibre.

export type MapState = 'loading' | 'ready' | 'failed'
export type MapEvent = 'ready' | 'failed' | 'retry'

/**
 * The frame's state after an event. A failure sticks until the reader retries: when the tiles fail on first load,
 * MapLibre reports the errors and then goes idle, and that idle must not hide the failure.
 */
export function mapStateAfter(state: MapState, event: MapEvent): MapState {
  if (event === 'retry') return 'loading'
  if (event === 'failed') return 'failed'
  return state === 'failed' ? 'failed' : 'ready'
}
