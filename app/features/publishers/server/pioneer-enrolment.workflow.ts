import type { PioneerEnrolment } from '~/database/generated/client'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import {
  closeEnrolment,
  deleteEnrolment,
  type OpenEnrolmentParams,
  openEnrolment,
  type UpdateEnrolmentParams,
  updateEnrolment,
} from './pioneer-enrolment.aggregate'

// Cross-aggregate orchestration for a single manager action: mutating an enrolment, then bringing
// the member's identity roles back in line with it. The route runs these inside its
// `withScopeFromContext` tx, so any failure — the mutation or the role sync — rolls the whole change
// back rather than leaving the stints and the role assignments disagreeing.
//
// Role assignments are stored rows, not a live view, so every mutation has to re-sync. The sync
// re-reads the member's stints and derives their standing status itself, which is what makes this
// correct for an edit that changes a stint's SHAPE — closing an ongoing one, reopening a closed one,
// or changing an ongoing one's type each move the member's status a different way.

function _syncMemberRoles(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  return syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)
}

export async function enrolPioneer(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  params: OpenEnrolmentParams,
): Promise<PioneerEnrolment> {
  const enrolment = await openEnrolment(db, memberId, congregationId, actorId, params)
  await _syncMemberRoles(db, memberId, congregationId, actorId)
  return enrolment
}

export async function endPioneerEnrolment(
  db: TransactionClient,
  enrolmentId: number,
  congregationId: number,
  actorId: number,
  end: { endMonth: number; endYear: number },
): Promise<PioneerEnrolment> {
  const enrolment = await closeEnrolment(db, enrolmentId, congregationId, actorId, end)
  await _syncMemberRoles(db, enrolment.memberId, congregationId, actorId)
  return enrolment
}

// Edit a stint's period (and optionally its type). No route posts to this yet — the edit UI is a
// follow-up; it is here because the role re-sync is what makes such a route safe to add. A period
// edit is what makes that load-bearing: adding an end date to the member's only ongoing stint has to
// drop their standing status, and clearing one has to restore it.
export async function updatePioneerEnrolment(
  db: TransactionClient,
  enrolmentId: number,
  congregationId: number,
  actorId: number,
  params: UpdateEnrolmentParams,
): Promise<PioneerEnrolment> {
  const enrolment = await updateEnrolment(db, enrolmentId, congregationId, actorId, params)
  await _syncMemberRoles(db, enrolment.memberId, congregationId, actorId)
  return enrolment
}

// Delete an enrolment outright (undo a mistaken one).
export async function removePioneerEnrolment(
  db: TransactionClient,
  enrolmentId: number,
  congregationId: number,
  actorId: number,
): Promise<PioneerEnrolment> {
  const removed = await deleteEnrolment(db, enrolmentId, congregationId, actorId)
  await _syncMemberRoles(db, removed.memberId, congregationId, actorId)
  return removed
}

// Close every member's ongoing stint of one type, congregation-wide. Used when a congregation turns
// off the permanent-auxiliary profile: those members stop being permanent auxiliaries, and the stint
// is where that fact lives now. Only ONGOING stints match — a single-month auxiliary is already
// closed and re-dating it would rewrite history that actually happened.
//
// Replaces member.aggregate's bulkUpdateType, which flipped the cached `Member.type` column and left
// the stints open, so the two immediately disagreed.
export async function endOngoingEnrolmentsOfType(
  db: TransactionClient,
  congregationId: number,
  actorId: number,
  type: PublisherType,
  end: { endMonth: number; endYear: number },
): Promise<{ closed: number; skippedFutureDated: number }> {
  // Starts on or before the end date. A stint dated ahead (the create form offers ±2 years) cannot
  // be closed at `end` — closeEnrolment rejects an end before the start — and because this runs
  // congregation-wide, one such stint would throw and take the entire settings save with it rather
  // than just itself. Those are left open and reported in the return value.
  const endAbs = end.endYear * 12 + end.endMonth
  const allOngoing = await db.pioneerEnrolment.findMany({
    where: { congregationId, type, endMonth: null, endYear: null },
    select: { id: true, memberId: true, startMonth: true, startYear: true },
  })
  const ongoing = allOngoing.filter(s => s.startYear * 12 + s.startMonth <= endAbs)

  for (const stint of ongoing) {
    await closeEnrolment(db, stint.id, congregationId, actorId, end)
  }
  // Re-sync after all the closes, and once per member: a member cannot hold two ongoing stints, but
  // syncing inside the loop would still be redundant work for no benefit.
  for (const memberId of new Set(ongoing.map(s => s.memberId))) {
    await _syncMemberRoles(db, memberId, congregationId, actorId)
  }

  return { closed: ongoing.length, skippedFutureDated: allOngoing.length - ongoing.length }
}
