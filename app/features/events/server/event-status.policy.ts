import { programmeAwaits } from '~/features/events/model/empty-meetings'
import * as m from '~/i18n/paraglide/messages'
import { ConflictError } from '~/shared/errors/app-error.server'

// Pure release-time invariants. No DB access — callers load the assignments
// (with the hasConflict flag) and hand a plain shape to the policy.
//
// The error is deliberately short: the event view page already surfaces every
// conflict inline (badge next to the assignee), so enumerating names in a
// toast would just duplicate that and get unreadable with several conflicts
// on the same event.

// Getters, so each message reads the language of the request that raises it, not the one the
// module happened to load in.
export const EVENT_STATUS_ERRORS = {
  get releaseBlockedByConflicts() {
    return m.event_status_error_release_blocked()
  },
  get releaseAwaitingProgramme() {
    return m.event_status_error_release_awaiting()
  },
  get publishEmpty() {
    return m.event_status_error_publish_empty()
  },
}

export type PartReleaseAssignment = { hasConflict: boolean }
export type ServicePartReleaseAssignment = { hasConflict: boolean }

export type ReleaseAssignments = {
  eventParts: PartReleaseAssignment[]
  eventServiceParts: ServicePartReleaseAssignment[]
}

export function assertCanRelease(assignments: ReleaseAssignments): void {
  const hasAny =
    assignments.eventParts.some(p => p.hasConflict) || assignments.eventServiceParts.some(s => s.hasConflict)
  if (!hasAny) return
  throw new ConflictError(EVENT_STATUS_ERRORS.releaseBlockedByConflicts)
}

/** Why publishing holds a schedule back: a programme still to give, nothing in it, or someone assigned away that day. */
export type PublishRefusal = 'conflicts' | 'awaiting' | 'empty'

/**
 * What publishing a schedule refuses, in the order it checks: a programme still to give, then emptiness (no schedule
 * is published empty), then someone assigned away that day. Null when it publishes, filled or not. publishSchedule
 * and the bulk preview both ask this, so the preview announces what publishing does.
 */
export function scheduleRefusal(
  schedule: { kind: string; items: { hasConflict: boolean }[]; fromTemplate: boolean },
  template: { key: string | null; _count: { parts: number; serviceParts: number } } | null,
): PublishRefusal | null {
  const { kind, items, fromTemplate } = schedule
  if (programmeAwaits({ kind, items: items.length, fromTemplate }, template)) return 'awaiting'
  if (items.length === 0) return 'empty'
  return items.some(item => item.hasConflict) ? 'conflicts' : null
}
