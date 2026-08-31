import type { PioneerEnrolment } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { standingTypeFromEnrolments } from '../model/pioneer-enrolment'
import { setPioneerType } from './member.aggregate'
import {
  closeEnrolment,
  deleteEnrolment,
  type OpenEnrolmentParams,
  openEnrolment,
  type UpdateEnrolmentParams,
  updateEnrolment,
} from './pioneer-enrolment.aggregate'

// Cross-aggregate orchestration for a single manager action: mutating an enrolment while keeping the
// synced `Member.type` cache in step. The route runs these inside its `withScopeFromContext` tx, so
// any failure — the mutation, the recompute, or the role sync it triggers — rolls the whole change
// back rather than leaving the stint and the cache disagreeing.
//
// Every mutation funnels through `_recomputeStandingType`, which re-derives the cache from the
// member's surviving stints rather than reasoning about what the individual edit did. That matters
// because an edit can change a stint's SHAPE — closing an ongoing one, reopening a closed one, or
// changing an ongoing one's type — and each of those moves the cache in a different direction.
// Deriving from the end state is the only version that stays correct for all of them.

async function _recomputeStandingType(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const stints = await db.pioneerEnrolment.findMany({
    where: { memberId, congregationId },
    select: { type: true, startMonth: true, startYear: true, endMonth: true, endYear: true, monthlyGoal: true },
  })
  await setPioneerType(db, memberId, congregationId, actorId, standingTypeFromEnrolments(stints))
}

export async function enrolPioneer(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  params: OpenEnrolmentParams,
): Promise<PioneerEnrolment> {
  const enrolment = await openEnrolment(db, memberId, congregationId, actorId, params)
  await _recomputeStandingType(db, memberId, congregationId, actorId)
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
  await _recomputeStandingType(db, enrolment.memberId, congregationId, actorId)
  return enrolment
}

// Edit a stint's period (and optionally its type). No route posts to this yet — the edit UI is a
// follow-up; it is here because the recompute is what makes such a route safe to add. The period edit is what makes the recompute
// load-bearing: adding an end date to the member's only ongoing stint has to drop the cache back to
// Normal, and clearing one has to raise it again.
export async function updatePioneerEnrolment(
  db: TransactionClient,
  enrolmentId: number,
  congregationId: number,
  actorId: number,
  params: UpdateEnrolmentParams,
): Promise<PioneerEnrolment> {
  const enrolment = await updateEnrolment(db, enrolmentId, congregationId, actorId, params)
  await _recomputeStandingType(db, enrolment.memberId, congregationId, actorId)
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
  await _recomputeStandingType(db, removed.memberId, congregationId, actorId)
  return removed
}
