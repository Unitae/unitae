import * as m from '~/i18n/paraglide/messages'
import { ConflictError } from '~/shared/errors/app-error.server'

// Programme assignment invariants. Pure functions, no DB access.
//
// Two shapes coexist by design:
//   • assert*  — throws AppError subclasses. Kept for callers that prefer
//                throw semantics (Wave 1 pattern).
//   • check*   — returns `{ error } | null`. Used by writers in
//                event-part-assignments.server.ts that surface errors via
//                the existing `{ error } | { assignment }` return type.
//
// Every user-visible error string flows through PROGRAMME_ASSIGNMENT_ERRORS
// so message drift between the two writers (assignPart / assignServicePart)
// is impossible.

// Getters, so each message reads the language of the request that raises it, not the one the
// module happened to load in.
export const PROGRAMME_ASSIGNMENT_ERRORS = {
  get assignmentNotFound() {
    return m.event_part_error_assignment_not_found()
  },
  get externalSpeakerInvalid() {
    return m.event_part_error_external_speaker_invalid()
  },
  get participantsNotDistinct() {
    return m.event_part_error_participants_not_distinct()
  },
  get ineligibleSpeaker() {
    return m.event_part_error_ineligible_speaker()
  },
  get ineligibleReader() {
    return m.event_part_error_ineligible_reader()
  },
  get ineligibleServant() {
    return m.event_part_error_ineligible_servant()
  },
  get dayOffSpeaker() {
    return m.event_part_error_day_off_publisher()
  },
  get dayOffReader() {
    return m.event_part_error_day_off_reader()
  },
  get dayOffServant() {
    return m.event_part_error_day_off_publisher()
  },
}

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

/**
 * A speaker can be newly assigned only while on a list. One retired after being planned keeps the part: `keeping`
 * says the part already holds this speaker, so saving it again (a topic, a duration) does not fail on them.
 */
export function checkExternalSpeakerValid(
  speaker: { archivedAt: Date | null } | null,
  keeping = false,
): Rejection | null {
  if (speaker == null || (speaker.archivedAt != null && !keeping)) {
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

// Day-off overlap message per role. Parallel to INELIGIBLE_MESSAGE. Used
// by the writers to build a Rejection when releasing an event would silently
// schedule a publisher on top of a known absence — on drafts we save with
// hasConflict=true instead (the release-blocking policy surfaces it later).
export const DAY_OFF_MESSAGE: Record<ProgrammeRoleKind, string> = {
  speaker: PROGRAMME_ASSIGNMENT_ERRORS.dayOffSpeaker,
  reader: PROGRAMME_ASSIGNMENT_ERRORS.dayOffReader,
  servant: PROGRAMME_ASSIGNMENT_ERRORS.dayOffServant,
}

export function checkEligibleForRole(
  eligibleUserIds: number[],
  assigneeId: number,
  roleKind: ProgrammeRoleKind,
): Rejection | null {
  return eligibleUserIds.includes(assigneeId) ? null : { error: INELIGIBLE_MESSAGE[roleKind] }
}
