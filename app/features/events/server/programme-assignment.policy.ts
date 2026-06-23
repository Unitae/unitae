import { ConflictError } from '~/shared/errors/app-error.server'

// Programme assignment invariants. Pure functions, no DB access.
//
// Wave 1 seeds this file with the distinct-participants rule so the bug fix
// in `assignPart` lives at the policy layer from day one. Wave 5 extends
// with `assertAssignable` and other shared rules currently duplicated
// across `assignPart` and `assignServiceRole`.

export function areParticipantsDistinct(assigneeId: number | null, assistantId: number | null): boolean {
  if (assigneeId == null || assistantId == null) return true
  return assigneeId !== assistantId
}

export function assertDistinctParticipants(assigneeId: number | null, assistantId: number | null): void {
  if (!areParticipantsDistinct(assigneeId, assistantId)) {
    throw new ConflictError('Speaker and reader (assistant) must be different persons')
  }
}
