import { ConflictError } from '~/shared/errors/app-error.server'

// Pure release-time invariants. No DB access — callers load the assignments
// (with assignee / assistant names) and hand a plain shape to the policy.
// The message enumerates every offending assignment so the manager can jump
// straight to what needs fixing.

export const EVENT_STATUS_ERRORS = {
  releaseBlockedByConflicts: "Impossible de publier : cet événement a des conflits d'absence à résoudre.",
} as const

type Named = { firstname: string; lastname: string }

export type PartReleaseAssignment = {
  name: string
  hasConflict: boolean
  assignee: Named | null
  assistant: Named | null
}

export type ServiceRoleReleaseAssignment = {
  name: string
  hasConflict: boolean
  assignee: Named | null
}

export type ReleaseAssignments = {
  parts: PartReleaseAssignment[]
  serviceRoles: ServiceRoleReleaseAssignment[]
}

function fullName(person: Named | null): string | null {
  if (!person) return null
  return `${person.firstname} ${person.lastname}`.trim()
}

function describePart(part: PartReleaseAssignment): string {
  const names = [fullName(part.assignee), fullName(part.assistant)].filter((n): n is string => n != null)
  return names.length > 0 ? `${part.name} (${names.join(', ')})` : part.name
}

function describeService(service: ServiceRoleReleaseAssignment): string {
  const name = fullName(service.assignee)
  return name != null ? `${service.name} (${name})` : service.name
}

export function assertCanRelease(assignments: ReleaseAssignments): void {
  const conflictingParts = assignments.parts.filter(p => p.hasConflict).map(describePart)
  const conflictingServices = assignments.serviceRoles.filter(s => s.hasConflict).map(describeService)
  const offenders = [...conflictingParts, ...conflictingServices]

  if (offenders.length === 0) return

  throw new ConflictError(`${EVENT_STATUS_ERRORS.releaseBlockedByConflicts} ${offenders.join(' ; ')}`)
}
