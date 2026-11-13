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
