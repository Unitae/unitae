import { EventStatus } from '~/features/events/model/event-status.type'

// An event's schedules: its programme (parts) and its duty schedules (duties, the « services » of today), each made
// from a schedule template and published on its own. Until the readers move over, an event has at most one of each,
// written beside its items' `eventId` and its own `status`.

export const ScheduleKind = {
  Programme: 'programme',
  Duty: 'duty',
} as const

export type ScheduleKind = (typeof ScheduleKind)[keyof typeof ScheduleKind]

export const ScheduleStatus = {
  Draft: 'draft',
  Published: 'published',
} as const

export type ScheduleStatus = (typeof ScheduleStatus)[keyof typeof ScheduleStatus]

/** The key the catalogue names a schedule or schedule template by when it has no name of its own. */
export const UNNAMED_SCHEDULE_KEY: Record<ScheduleKind, string> = {
  [ScheduleKind.Programme]: 'programme',
  [ScheduleKind.Duty]: 'services',
}

/** A template suggests its programme first, then its duties. */
export const SCHEDULE_ORDER: Record<ScheduleKind, number> = {
  [ScheduleKind.Programme]: 0,
  [ScheduleKind.Duty]: 1,
}

/** A schedule's status while it follows its event's: published when the event is released. */
export function scheduleStatusFor(eventStatus: string): ScheduleStatus {
  return eventStatus === EventStatus.Released ? ScheduleStatus.Published : ScheduleStatus.Draft
}
