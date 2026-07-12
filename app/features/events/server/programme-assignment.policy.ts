import { ConflictError } from '~/shared/errors/app-error.server'

// Programme assignment invariants. Pure functions, no DB access.
//
// Two shapes coexist by design:
//   • assert*  — throws AppError subclasses. Kept for callers that prefer
//                throw semantics (Wave 1 pattern).
//   • check*   — returns `{ error } | null`. Used by writers in
//                programme-assignments.server.ts that surface errors via
//                the existing `{ error } | { assignment }` return type.
//
// Every user-visible error string flows through PROGRAMME_ASSIGNMENT_ERRORS
// so message drift between the two writers (assignPart / assignServiceRole)
// is impossible.

export const PROGRAMME_ASSIGNMENT_ERRORS = {
  assignmentNotFound: "L'attribution n'existe pas.",
  externalSpeakerInvalid: "Cet orateur externe n'existe pas ou a été archivé.",
  participantsNotDistinct: "L'orateur et le lecteur ne peuvent pas être la même personne.",
  ineligibleSpeaker: "L'orateur sélectionné ne fait pas partie des rôles autorisés pour cette partie.",
  ineligibleReader: 'Le deuxième orateur sélectionné ne fait pas partie des rôles autorisés pour cette partie.',
  ineligibleServant: 'Le proclamateur sélectionné ne fait pas partie des rôles autorisés pour ce service.',
  dayOffSpeaker: 'Ce proclamateur a une absence durant cette date.',
  dayOffReader: 'Le deuxième orateur a une absence durant cette date.',
  dayOffServant: 'Ce proclamateur a une absence durant cette date.',
} as const

export type ProgrammeRoleKind = 'speaker' | 'reader' | 'servant'
export type Rejection = { error: string }

export function areParticipantsDistinct(assigneeId: number | null, assistantId: number | null): boolean {
  if (assigneeId == null || assistantId == null) return true
  return assigneeId !== assistantId
}

export function assertDistinctParticipants(assigneeId: number | null, assistantId: number | null): void {
  if (!areParticipantsDistinct(assigneeId, assistantId)) {
    throw new ConflictError(PROGRAMME_ASSIGNMENT_ERRORS.participantsNotDistinct)
  }
}

export function checkExternalSpeakerValid(speaker: { archivedAt: Date | null } | null): Rejection | null {
  if (speaker == null || speaker.archivedAt != null) {
    return { error: PROGRAMME_ASSIGNMENT_ERRORS.externalSpeakerInvalid }
  }
  return null
}

export function checkParticipantsDistinct(assigneeId: number | null, assistantId: number | null): Rejection | null {
  if (!areParticipantsDistinct(assigneeId, assistantId)) {
    return { error: PROGRAMME_ASSIGNMENT_ERRORS.participantsNotDistinct }
  }
  return null
}

const INELIGIBLE_MESSAGE: Record<ProgrammeRoleKind, string> = {
  speaker: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleSpeaker,
  reader: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleReader,
  servant: PROGRAMME_ASSIGNMENT_ERRORS.ineligibleServant,
}

export function checkEligibleForRole(
  eligibleUserIds: number[],
  assigneeId: number,
  roleKind: ProgrammeRoleKind,
): Rejection | null {
  return eligibleUserIds.includes(assigneeId) ? null : { error: INELIGIBLE_MESSAGE[roleKind] }
}

const DAY_OFF_MESSAGE: Record<ProgrammeRoleKind, string> = {
  speaker: PROGRAMME_ASSIGNMENT_ERRORS.dayOffSpeaker,
  reader: PROGRAMME_ASSIGNMENT_ERRORS.dayOffReader,
  servant: PROGRAMME_ASSIGNMENT_ERRORS.dayOffServant,
}

export function checkNoDayOffConflict(hasConflict: boolean, roleKind: ProgrammeRoleKind): Rejection | null {
  return hasConflict ? { error: DAY_OFF_MESSAGE[roleKind] } : null
}
