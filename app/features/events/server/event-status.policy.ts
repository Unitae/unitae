import { ConflictError } from '~/shared/errors/app-error.server'

// Pure release-time invariants. No DB access — callers load the assignments
// (with the hasConflict flag) and hand a plain shape to the policy.
//
// The error is deliberately short: the event view page already surfaces every
// conflict inline (badge next to the assignee), so enumerating names in a
// toast would just duplicate that and get unreadable with several conflicts
// on the same event.

export const EVENT_STATUS_ERRORS = {
  releaseBlockedByConflicts: "Impossible de publier : cet événement a des conflits d'absence à résoudre.",
} as const

export type PartReleaseAssignment = { hasConflict: boolean }
export type ServiceRoleReleaseAssignment = { hasConflict: boolean }

export type ReleaseAssignments = {
  eventParts: PartReleaseAssignment[]
  eventServiceRoles: ServiceRoleReleaseAssignment[]
}

export function assertCanRelease(assignments: ReleaseAssignments): void {
  const hasAny =
    assignments.eventParts.some(p => p.hasConflict) || assignments.eventServiceRoles.some(s => s.hasConflict)
  if (!hasAny) return
  throw new ConflictError(EVENT_STATUS_ERRORS.releaseBlockedByConflicts)
}
