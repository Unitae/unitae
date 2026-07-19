import type { CadenceEntry, PartSlot } from '~/features/events/model/cadence.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

export type { CadenceEntry, PartSlot }

export const EMPTY_CADENCE = { past: [], future: [] } as const

// Same-slot comparison is diacritic-insensitive and tolerant of case /
// surrounding whitespace so trivial drift between the current row and
// historical rows doesn't split them into two distinct cadences.
export function normalize(input: string): string {
  return stripDiacritics(input).trim()
}
