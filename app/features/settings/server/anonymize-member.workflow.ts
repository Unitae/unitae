import { memberAggregate } from '~/features/publishers'
import { attributionAggregate } from '~/features/territories'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Orchestrates the anonymize action across two aggregates:
 *   1. Close every open attribution for the publisher (Attribution invariant).
 *   2. Scrub the Member's PII + drop role assignments (Member invariant).
 *
 * The order matters: closing attributions first preserves referential
 * accuracy in the audit trail — the closed rows still reference a Member
 * whose identity flags are intact at the moment of closure.
 */
export async function anonymizeMemberWorkflow(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
): Promise<void> {
  await attributionAggregate.markReturnedForPublisher(db, memberId, new Date(), congregationId, actorId)
  await memberAggregate.anonymize(db, memberId, congregationId, actorId)
}
