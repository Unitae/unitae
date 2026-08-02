import type { PioneerEnrolment } from '~/database/generated/client'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { setPioneerType } from './member.aggregate'
import { closeEnrolment, type OpenEnrolmentParams, openEnrolment } from './pioneer-enrolment.aggregate'

// Cross-aggregate orchestration for a single manager action: opening/closing an enrolment while
// keeping the synced `Member.type` cache in step. The route runs this inside its
// `withScopeFromContext` tx, so a role-sync throw rolls the whole enrolment back.
//
// Rule (spec §7.1), keyed on the stint's SHAPE, not its type:
//   - an ONGOING stint (no end) sets Member.type — a standing status (annual OR permanent auxiliary);
//   - a SINGLE-MONTH auxiliary stint leaves Member.type as Normal (transient sign-up, read from the
//     enrolment record, never the type cache).

export async function enrolPioneer(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
  params: OpenEnrolmentParams,
): Promise<PioneerEnrolment> {
  const enrolment = await openEnrolment(db, memberId, congregationId, actorId, params)

  const isOngoing = params.endMonth == null
  if (isOngoing) {
    await setPioneerType(db, memberId, congregationId, actorId, params.type)
  }

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

  // If this was the member's last ongoing stint, the standing status ends → revert the type cache.
  const remainingOngoing = await db.pioneerEnrolment.count({
    where: { memberId: enrolment.memberId, congregationId, endMonth: null },
  })
  if (remainingOngoing === 0) {
    await setPioneerType(db, enrolment.memberId, congregationId, actorId, PublisherType.Normal)
  }

  return enrolment
}
