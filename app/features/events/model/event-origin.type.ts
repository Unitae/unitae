// Who created an event (Event.origin). Only the job's events, while empty, move with their template or go with it: an
// event someone made or prepared stays where it is, whatever happens to its author's account. A meeting the job made
// becomes « manual » once someone gives it its programme or moves it; adding a part by hand leaves it the job's.

export const EventOrigin = {
  /** Created ahead by the recurring-events job. */
  Job: 'job',
  /** Created by a person, or a job meeting someone prepared or moved. */
  Manual: 'manual',
  /** Restored without a known origin: an older archive's event that was not an empty meeting, or an origin this
   * version does not know. */
  Import: 'import',
} as const

export type EventOrigin = (typeof EventOrigin)[keyof typeof EventOrigin]

export const EVENT_ORIGINS: readonly EventOrigin[] = [EventOrigin.Job, EventOrigin.Manual, EventOrigin.Import]

export function isEventOrigin(value: unknown): value is EventOrigin {
  return typeof value === 'string' && (EVENT_ORIGINS as readonly string[]).includes(value)
}
