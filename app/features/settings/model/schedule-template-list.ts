import type { PartPlaces } from '~/features/events'

/** A part as the schedule template's list shows it. */
export interface ListedPart {
  id: number
  name: string
  section: string
  order: number
  durationMin: number | null
}

/** Consecutive parts of one section, or outside any (`section: null`). */
export interface PartRun<P extends ListedPart> {
  section: string | null
  parts: P[]
  /** Its time: a part held in several rooms happens once, at the same time in each. */
  minutes: number
}

const minutesOf = (parts: ListedPart[]) => parts.reduce((sum, part) => sum + (part.durationMin ?? 0), 0)

/** A programme template's parts as its list reads them, in their order: runs of one section, and the programme's time. */
export function groupTemplateParts<P extends ListedPart>(parts: P[]) {
  const runs: PartRun<P>[] = []
  for (const part of parts) {
    const section = part.section === '' ? null : part.section
    const last = runs.at(-1)
    if (last != null && last.section === section) last.parts.push(part)
    else runs.push({ section, parts: [part], minutes: 0 })
  }
  for (const run of runs) run.minutes = minutesOf(run.parts)
  return {
    runs,
    total: {
      count: parts.length,
      minutes: runs.reduce((sum, run) => sum + run.minutes, 0),
      withoutDuration: parts.filter(part => part.durationMin == null).length,
    },
  }
}

/** Where a new part starts: its section, and its place. */
export interface PartDraft {
  section: string
  order: number
}

/** A place after a group's last part; after the template's last for an empty group. */
export const orderAfter = (group: readonly ListedPart[], lastOrder: number) => (group.at(-1)?.order ?? lastOrder) + 1

/** « + Partie » at the end of a section's parts. */
export function sectionPartDraft<P extends ListedPart>(run: PartRun<P>, lastOrder: number): PartDraft {
  return { section: run.section ?? '', order: orderAfter(run.parts, lastOrder) }
}

/** The parts as the list shows them, top to bottom. */
export function partsInListOrder<P extends ListedPart>(parts: P[]): P[] {
  return groupTemplateParts(parts).runs.flatMap(run => run.parts)
}

/** What a part can be put in: the template's sections in the list's order, and its rooms. */
export function templatePlaces(parts: readonly ListedPart[], rooms: PartPlaces['rooms']): PartPlaces {
  const sections: string[] = []
  for (const part of [...parts].sort((a, b) => a.order - b.order)) {
    if (part.section !== '' && !sections.includes(part.section)) sections.push(part.section)
  }
  return { sections, rooms }
}

/**
 * What moves at the top of the list: a part outside any section on its own, or a section with all its parts (design
 * round A: « une section se déplace avec toutes ses parties »). A section's `run` is its place among the runs; its
 * `key`, its smallest part id, is what a move or a rename leaves as it is, to keep its header and focus.
 */
export type TopItem = { kind: 'part'; id: number } | { kind: 'section'; section: string; run: number; key: number }

const runIds = <P extends ListedPart>(run: PartRun<P>) => run.parts.map(part => part.id)

/** The top of the list, in order. */
export function topItems<P extends ListedPart>(parts: P[]): TopItem[] {
  return groupTemplateParts(parts).runs.flatMap((run, index): TopItem[] =>
    run.section == null
      ? runIds(run).map(id => ({ kind: 'part', id }))
      : [{ kind: 'section', section: run.section, run: index, key: Math.min(...runIds(run)) }],
  )
}

const moved = <T>(list: readonly T[], from: number, to: number) => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}

/** Every part's id in the new order once the top item at `from` is moved to `to`; null when nothing moves. */
export function idsAfterTopMove<P extends ListedPart>(parts: P[], from: number, to: number): number[] | null {
  const { runs } = groupTemplateParts(parts)
  const blocks = runs.flatMap(run => (run.section == null ? runIds(run).map(id => [id]) : [runIds(run)]))
  if (from === to || blocks[from] == null || to < 0 || to >= blocks.length) return null
  return moved(blocks, from, to).flat()
}

/**
 * Every part's id in the new order once a part is moved within its section to `to`, its place there; null when
 * nothing moves. A part outside any section moves at the top.
 */
export function idsAfterGroupMove<P extends ListedPart>(parts: P[], partId: number, to: number): number[] | null {
  const { runs } = groupTemplateParts(parts)
  for (const run of runs) {
    if (run.section == null) continue
    const from = run.parts.findIndex(part => part.id === partId)
    if (from < 0) continue
    if (from === to || to < 0 || to >= run.parts.length) return null
    run.parts = moved(run.parts, from, to)
    return runs.flatMap(runIds)
  }
  return null
}
