import { memberAggregate } from '~/features/publishers/index.server'
import { attributionAggregate } from '~/features/territories/index.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Orchestrates the anonymize action across two aggregates:
 *   1. Close every open attribution for the publisher (Attribution invariant).
 *   2. Scrub the Member's PII + drop role assignments (Member invariant).
 *
 * The two writes commute — the resulting DB state is identical either way —
 * but attribution-close-first mirrors the real-world sequence a user sees
 * on the audit log timeline (territories handed back, then the person left
 * the roster).
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
