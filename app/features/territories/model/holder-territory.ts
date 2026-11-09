import { type EntranceAccessSource, formatAccessSequence } from '~/features/territories/model/access-format'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'

/**
 * What the person holding a territory needs to know of one of its entrances, and nothing a
 * manager keeps for themselves: building and territory notes stay on the server.
 */
export interface HolderEntrance {
  id: number
  street: string
  zip: string
  /** The numbers of the buildings sharing this entrance, smallest first. */
  numbers: string[]
  /** How to get in, e.g. « Digicode → Interphone »; empty when nobody recorded it. */
  access: string
  /** Doors open in the morning; only meaningful behind a door code. */
  openEarly: boolean
  /** Mailboxes reachable; only meaningful behind a door code. */
  mailboxOpen: boolean
  homes: number
  phones: number
  /** The information for publishers, printed on the territory card as well. */
  notes: string
  shopKind: string
  /** Where its buildings stand, each with its number to label the map. */
  points: { lat: number; lng: number; number: string }[]
}

export interface StreetGroup {
  street: string
  zip: string
  homes: number
  entrances: HolderEntrance[]
}

export interface HolderEntranceSource extends EntranceAccessSource {
  id: number
  homes: number | null
  phones: number | null
  isOpenEarly: boolean | null
  isMailboxOpen: boolean | null
  notes: string
  shopKind: string
  buildings: { number: string; street: string; zip: string; latitude: number | null; longitude: number | null }[]
}

/** Numbers and names in the reader's order: « 2bis » before « 4 », « 4 » before « 10 ». */
function collatorFor(locale: string) {
  return new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
}

export function toHolderEntrance(source: HolderEntranceSource, locale: string): HolderEntrance | null {
  const first = source.buildings[0]
  if (first == null) return null

  const hasCode =
    (source.accesses ?? []).some(a => a.type === TerritoryAccess.Code) || source.access === TerritoryAccess.Code
  return {
    id: source.id,
    street: first.street,
    zip: first.zip,
    numbers: source.buildings.map(b => b.number).sort(collatorFor(locale).compare),
    access: formatAccessSequence(source),
    openEarly: hasCode && source.isOpenEarly === true,
    mailboxOpen: hasCode && source.isMailboxOpen === true,
    homes: source.homes ?? 0,
    phones: source.phones ?? 0,
    notes: source.notes.trim(),
    shopKind: source.shopKind,
    points: source.buildings.flatMap(b =>
      b.latitude != null && b.longitude != null ? [{ lat: b.latitude, lng: b.longitude, number: b.number }] : [],
    ),
  }
}

/** The entrances street by street, alphabetically, each street's entrances in the order of their numbers. */
export function groupByStreet(entrances: HolderEntrance[], locale: string): StreetGroup[] {
  const collator = collatorFor(locale)
  const groups = new Map<string, StreetGroup>()
  for (const entrance of entrances) {
    // The same name in two postcodes is two streets.
    const key = `${entrance.street}\u0000${entrance.zip}`
    const group = groups.get(key) ?? { street: entrance.street, zip: entrance.zip, homes: 0, entrances: [] }
    group.homes += entrance.homes
    group.entrances.push(entrance)
    groups.set(key, group)
  }

  const result = [...groups.values()]
  for (const group of result) {
    group.entrances.sort((a, b) => collator.compare(a.numbers[0] ?? '', b.numbers[0] ?? ''))
  }
  return result.sort((a, b) => collator.compare(a.street, b.street) || collator.compare(a.zip, b.zip))
}

/** The streets a territory covers, the one with the most entrances first: what names it in a list. */
export function mainStreets(streets: string[], locale: string): string[] {
  const counts = new Map<string, number>()
  for (const street of streets) counts.set(street, (counts.get(street) ?? 0) + 1)
  const collator = collatorFor(locale)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0])).map(([street]) => street)
}
