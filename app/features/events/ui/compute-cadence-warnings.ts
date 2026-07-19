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

  const consecutive = past.at(-1)?.assigned === true || future[0]?.assigned === true

  let rotationConcern: CadenceWarnings['rotationConcern'] = null
  if (past.length >= ROTATION_WINDOW) {
    const window = past.slice(-ROTATION_WINDOW)
    const assigned = window.filter(e => e.assigned).length
    if (assigned >= ROTATION_THRESHOLD) rotationConcern = { assigned, window: ROTATION_WINDOW }
  }

  return { firstTime, overdue, consecutive, rotationConcern }
}
