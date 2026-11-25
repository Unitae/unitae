import type { PartPlaces } from '~/features/events'

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

/** Where a new part starts: its section and hall, and its place. */
export interface PartDraft {
  section: string
  track: string
  trackOrder: number | null
  order: number
}

/** A place after a group's last part; after the template's last for an empty group. */
export const orderAfter = (group: readonly ListedPart[], lastOrder: number) => (group.at(-1)?.order ?? lastOrder) + 1

/** « + Partie » at the end of a section's parts outside any hall. */
export function sectionPartDraft<P extends ListedPart>(run: PartRun<P>, lastOrder: number): PartDraft {
  return { section: run.section ?? '', track: '', trackOrder: null, order: orderAfter(run.parts, lastOrder) }
}

/** « + Partie » at the end of a hall, in that hall. */
export function hallPartDraft<P extends ListedPart>(run: PartRun<P>, hall: PartHall<P>, lastOrder: number): PartDraft {
  return {
    section: run.section ?? '',
    track: hall.name,
    trackOrder: hall.parts[0]?.trackOrder ?? null,
    order: orderAfter(hall.parts, lastOrder),
  }
}

/**
 * « Ajouter une salle en parallèle »: the section's next hall, after its last part. The first is the second hall (its
 * parts become the main one), the next ones are numbered on; the names come from the caller, in the reader's language.
 */
export function newHallDraft<P extends ListedPart>(
  run: PartRun<P>,
  lastOrder: number,
  names: { second: string; nth: (number: number) => string },
): PartDraft {
  const first = run.halls.length === 0
  return {
    section: run.section ?? '',
    track: first ? names.second : names.nth(run.halls.length + 1),
    trackOrder: first ? 2 : run.halls.length + 1,
    order: orderAfter([...run.parts, ...run.halls.flatMap(hall => hall.parts)], lastOrder),
  }
}

/** The parts as the list shows them, top to bottom: each run's parts outside any hall, then its halls'. */
export function partsInListOrder<P extends ListedPart>(parts: P[]): P[] {
  return groupTemplateParts(parts).runs.flatMap(run => [...run.parts, ...run.halls.flatMap(hall => hall.parts)])
}

/** What a part can be put in: the template's sections in the list's order, and each one's halls in their own. */
export function templatePlaces(parts: readonly ListedPart[]): PartPlaces {
  const sections: string[] = []
  const halls = new Map<string, { name: string; trackOrder: number | null }[]>()
  for (const part of [...parts].sort((a, b) => a.order - b.order)) {
    if (part.section !== '' && !sections.includes(part.section)) sections.push(part.section)
    if (part.track === '') continue
    const list = halls.get(part.section) ?? []
    halls.set(part.section, list)
    if (!list.some(hall => hall.name === part.track)) list.push({ name: part.track, trackOrder: part.trackOrder })
  }
  for (const list of halls.values()) list.sort((a, b) => (a.trackOrder ?? 0) - (b.trackOrder ?? 0))
  return { sections, halls }
}
