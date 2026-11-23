import type { CadenceEntry, CadenceHelperResult, CadencePayload, PartSlot } from '~/features/events/model/cadence.type'
import { itemStatusFor, ScheduleKind } from '~/features/events/model/schedule.type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

export type { CadenceEntry, CadenceHelperResult, CadencePayload, PartSlot }

// Sentinel returned by the resolver when there is no template to anchor on
// (freeform event) or the anchor assignment could not be found. Explicit
// type annotation keeps the shape from being narrowed to readonly-never[]
// via `as const` — the resolver and card boundaries both consume this.
export const EMPTY_CADENCE: CadencePayload = {
  anchored: false,
  past: [],
  future: [],
  hasHistory: false,
  lastAssignedAt: null,
  savedMatchesSelection: false,
}

/** The latest of some event dates, as an ISO string, or null when there are none. */
export function latestDate(dates: Date[]): string | null {
  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map(date => date.getTime()))).toISOString()
}

// Same-slot comparison is diacritic-insensitive and tolerant of case /
// surrounding whitespace so trivial drift between the current row and
// historical rows doesn't split them into two distinct cadences.
export function normalize(input: string): string {
  return stripDiacritics(input).trim()
}

// Bucket a raw Event.status string into the two states the strip actually
// renders. Unknown values fall through as 'released' — the schema does not
// use a Prisma enum today, and a stray value would otherwise silently
// render as a firm commitment. The one-line comment beside call sites
// documents the fall-through so behaviour is discoverable at the boundary.
export function toCadenceStatus(rawStatus: unknown): 'draft' | 'released' {
  return rawStatus === 'draft' ? 'draft' : 'released'
}

/** What a cadence row selects of its schedules: its programme's, which holds the parts the strip shows. */
export const PROGRAMME_SCHEDULE_SELECT = {
  schedules: { where: { kind: ScheduleKind.Programme }, select: { status: true } },
} as const

/**
 * A cadence row's status by its programme's own schedule (plan §10, 5b), not its event: a meeting whose duties alone
 * are published reads as a draft here. A row without a programme holds no part, and keeps its event's own label.
 */
export function cadenceStatusOf(row: { status: string; schedules: { status: string }[] }): 'draft' | 'released' {
  const programme = row.schedules[0]
  return toCadenceStatus(programme == null ? row.status : itemStatusFor(programme.status))
}
