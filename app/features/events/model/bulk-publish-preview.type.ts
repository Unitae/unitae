import type { ScheduleKind } from './schedule.type'

// What bulk « Publier » announces before it runs (bulkPublishPreview), as the dialog reads it.

/** A draft schedule as the dialog names it: its title (or its kind's label when unnamed), its meeting and day. */
export interface PreviewSchedule {
  id: number
  name: string | null
  kind: ScheduleKind
  eventId: number
  eventName: string
  startDate: Date
}

/** A meeting holding no schedule, which publishes as a whole (D46). */
export interface PreviewEvent {
  id: number
  name: string
  startDate: Date
}

export interface BulkPublishPreview {
  /** Published, each with its slots nobody holds yet: it publishes anyway (the user's rule: warn, allow). */
  publish: (PreviewSchedule & { unfilled: number })[]
  /** Someone else's to publish, with the role in charge of it when its template names one. */
  notYours: (PreviewSchedule & { responsible: { key: string; name: string | null } | null })[]
  /** Someone assigned is away that day: who, and on which part. */
  conflicts: (PreviewSchedule & { away: { person: string; part: string }[] })[]
  /** Nothing in it: no schedule is published empty. */
  empty: PreviewSchedule[]
  /** A programme still to give. */
  awaiting: PreviewSchedule[]
  events: { publish: PreviewEvent[]; awaiting: PreviewEvent[]; notYours: PreviewEvent[] }
}
