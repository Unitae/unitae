import type { EditorEntrance } from './editor-entrance.type'
import { TerritoryKindKey } from './territory-kind.type'

/** One change the editor holds until « Enregistrer »: an entrance added, removed, or taken from another territory. */
export type DraftChange =
  | { kind: 'add'; entrance: EditorEntrance }
  | { kind: 'remove'; entrance: EditorEntrance }
  | { kind: 'take'; entrance: EditorEntrance; from: { id: number; number: string } }

/** The changes, one per entrance at most. */
export type Draft = ReadonlyMap<number, DraftChange>

export const EMPTY_DRAFT: Draft = new Map()

export function withChange(draft: Draft, change: DraftChange): Draft {
  return new Map(draft).set(change.entrance.id, change)
}

export function withoutChange(draft: Draft, entranceId: number): Draft {
  if (!draft.has(entranceId)) return draft
  const next = new Map(draft)
  next.delete(entranceId)
  return next
}

export interface DraftRow {
  entrance: EditorEntrance
  change: DraftChange | null
}

/** The list: what the territory holds (a removed entrance stays, marked), then what it gains. */
export function draftRows(saved: readonly EditorEntrance[], draft: Draft): DraftRow[] {
  const savedIds = new Set(saved.map(entrance => entrance.id))
  const held = saved.map(entrance => ({ entrance, change: draft.get(entrance.id) ?? null }))
  const gained = [...draft.values()]
    .filter(change => change.kind !== 'remove' && !savedIds.has(change.entrance.id))
    .map(change => ({ entrance: change.entrance, change }))
  return [...held, ...gained]
}

/** The entrances the territory keeps or gains: what it will hold once saved. */
export function draftEntrances(saved: readonly EditorEntrance[], draft: Draft): EditorEntrance[] {
  return draftRows(saved, draft)
    .filter(row => row.change?.kind !== 'remove')
    .map(row => row.entrance)
}

/** What the form posts: every entrance the territory will hold, and those to take from another territory. */
export function draftSubmission(saved: readonly EditorEntrance[], draft: Draft) {
  return {
    entranceIds: draftEntrances(saved, draft).map(entrance => entrance.id),
    reassignments: [...draft.values()].flatMap(change =>
      change.kind === 'take' ? [{ entranceId: change.entrance.id, fromTerritoryId: change.from.id }] : [],
    ),
  }
}

/**
 * How much a territory holds, the way its type counts it: phone numbers for a phone territory, homes for a
 * door-to-door one or a campus (phones where homes are unknown), entrances for the others.
 */
export function contentOf(kind: TerritoryKindKey, entrances: readonly { homes: number; phones: number }[]): number {
  if (kind === TerritoryKindKey.Phone) return entrances.reduce((sum, entrance) => sum + entrance.phones, 0)
  if (kind === TerritoryKindKey.Classical || kind === TerritoryKindKey.Univ) {
    return entrances.reduce((sum, entrance) => sum + (entrance.homes || entrance.phones), 0)
  }
  return entrances.length
}

/** The territory's content before the changes and after them. */
export function draftContent(kind: TerritoryKindKey, saved: readonly EditorEntrance[], draft: Draft) {
  return { before: contentOf(kind, saved), after: contentOf(kind, draftEntrances(saved, draft)) }
}

export interface StreetGroup {
  street: string
  rows: DraftRow[]
}

/** Rows by street, streets and numbers in natural order (« 2 » before « 10 »). */
export function byStreet(rows: readonly DraftRow[], locale: string): StreetGroup[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const groups = new Map<string, DraftRow[]>()
  for (const row of rows) {
    const street = row.entrance.address.street
    groups.set(street, [...(groups.get(street) ?? []), row])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([street, streetRows]) => ({
      street,
      rows: [...streetRows].sort((a, b) => collator.compare(a.entrance.address.number, b.entrance.address.number)),
    }))
}

/** Where an entrance stands for the editor's map, as the zone API sees it. */
export type EntranceStanding = 'in-this-territory' | 'available' | 'on-other-territory'

/** A pin's look: on the territory, free, on another territory, or changed by the draft. */
export type PinState = 'in' | 'free' | 'other' | 'add' | 'remove'

export function pinState(entranceId: number, standing: EntranceStanding, draft: Draft): PinState {
  const change = draft.get(entranceId)
  if (change?.kind === 'remove') return 'remove'
  if (change != null) return 'add'
  if (standing === 'in-this-territory') return 'in'
  if (standing === 'available') return 'free'
  return 'other'
}
