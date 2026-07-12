import { memberAggregate } from '~/features/publishers'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Toggle a Member's `isPublisher` status. Thin delegator; invariant lives
 * in `member.aggregate.togglePublisher`.
 */
export function togglePublisherStatus(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  isPublisher: boolean,
  actorId: number,
) {
  return memberAggregate.togglePublisher(db, memberId, congregationId, isPublisher, actorId)
}
