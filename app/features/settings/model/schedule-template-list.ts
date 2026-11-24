/** A part as the schedule template's list shows it. */
export interface ListedPart {
  id: number
  name: string
  section: string
  track: string
  trackOrder: number | null
  order: number
  durationMin: number | null
}

/** A section's hall (« Salle principale », « Salle B »): its parts run in parallel with the other halls'. */
export interface PartHall<P extends ListedPart> {
  name: string
  parts: P[]
  minutes: number
}

/** Consecutive parts of one section, or outside any (`section: null`): those outside a hall, then its halls. */
export interface PartRun<P extends ListedPart> {
  section: string | null
  parts: P[]
  halls: PartHall<P>[]
  /** Its time, parallel halls counted once (the longest). */
  minutes: number
}

const minutesOf = (parts: ListedPart[]) => parts.reduce((sum, part) => sum + (part.durationMin ?? 0), 0)

/**
 * A programme template's parts as its list reads them, in their order: runs of one section, the halls of a section
 * nested in their own order, and the programme's time, parallel halls counted once.
 */
export function groupTemplateParts<P extends ListedPart>(parts: P[]) {
  const runs: PartRun<P>[] = []
  for (const part of parts) {
    const section = part.section === '' ? null : part.section
    const last = runs.at(-1)
    if (last != null && last.section === section) last.parts.push(part)
    else runs.push({ section, parts: [part], halls: [], minutes: 0 })
  }
  for (const run of runs) {
    const inHall = run.parts.filter(part => part.track !== '')
    run.parts = run.parts.filter(part => part.track === '')
    const names = [...new Set(inHall.map(part => part.track))].sort(
      (a, b) => trackOrder(inHall, a) - trackOrder(inHall, b),
    )
    run.halls = names.map(name => {
      const hallParts = inHall.filter(part => part.track === name)
      return { name, parts: hallParts, minutes: minutesOf(hallParts) }
    })
    run.minutes = minutesOf(run.parts) + Math.max(0, ...run.halls.map(hall => hall.minutes))
  }
  return {
    runs,
    total: {
      count: parts.length,
      minutes: runs.reduce((sum, run) => sum + run.minutes, 0),
      withoutDuration: parts.filter(part => part.durationMin == null).length,
    },
  }
}

function trackOrder(parts: ListedPart[], track: string) {
  return parts.find(part => part.track === track)?.trackOrder ?? 0
}
