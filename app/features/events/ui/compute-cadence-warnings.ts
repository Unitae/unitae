import type { CadenceEntry } from '~/features/events/model/cadence.type'

export type { CadenceEntry }

export type CadenceWarnings = {
  firstTime: boolean
  overdue: boolean
  consecutive: boolean
  rotationConcern: { assigned: number; window: number } | null
}

const ROTATION_WINDOW = 3
const ROTATION_THRESHOLD = 2

export function computeCadenceWarnings({
  past,
  future,
  hasHistory = false,
}: {
  past: CadenceEntry[]
  future: CadenceEntry[]
  // Whether the user has ever been on this slot on any past event of the same
  // template — flags the "used to do this, hasn't recently" case that the
  // visible window alone can't distinguish from a genuine first-timer.
  hasHistory?: boolean
}): CadenceWarnings {
  const anyAssigned = past.some(e => e.assigned) || future.some(e => e.assigned)
  const emptyWindow = !anyAssigned
  const firstTime = emptyWindow && !hasHistory
  const overdue = emptyWindow && hasHistory

  const previousIsThem = past.at(-1)?.assigned === true
  // The very next future dot only counts as a "consecutive" concern when it's
  // a real commitment (released). Drafts are still editable in-session and
  // shouldn't fire the warning.
  const nextIsThem = future[0]?.assigned === true && future[0]?.status === 'released'
  const consecutive = previousIsThem || nextIsThem

  let rotationConcern: CadenceWarnings['rotationConcern'] = null
  if (past.length >= ROTATION_WINDOW) {
    const window = past.slice(-ROTATION_WINDOW)
    const assigned = window.filter(e => e.assigned).length
    if (assigned >= ROTATION_THRESHOLD) rotationConcern = { assigned, window: ROTATION_WINDOW }
  }

  return { firstTime, overdue, consecutive, rotationConcern }
}
