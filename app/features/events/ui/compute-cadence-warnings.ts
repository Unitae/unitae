import type { CadenceEntry } from '~/features/events/model/cadence.type'

export type { CadenceEntry }

export type CadenceWarnings = {
  firstTime: boolean
  consecutive: boolean
  rotationConcern: { assigned: number; window: number } | null
}

const ROTATION_WINDOW = 3
const ROTATION_THRESHOLD = 2

export function computeCadenceWarnings({
  past,
  future,
}: {
  past: CadenceEntry[]
  future: CadenceEntry[]
}): CadenceWarnings {
  const anyAssigned = past.some(e => e.assigned) || future.some(e => e.assigned)
  const firstTime = !anyAssigned

  const consecutive = past.at(-1)?.assigned === true || future[0]?.assigned === true

  let rotationConcern: CadenceWarnings['rotationConcern'] = null
  if (past.length >= ROTATION_WINDOW) {
    const window = past.slice(-ROTATION_WINDOW)
    const assigned = window.filter(e => e.assigned).length
    if (assigned >= ROTATION_THRESHOLD) rotationConcern = { assigned, window: ROTATION_WINDOW }
  }

  return { firstTime, consecutive, rotationConcern }
}
