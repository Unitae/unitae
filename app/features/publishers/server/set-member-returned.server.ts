import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import * as memberAggregate from './member.aggregate'

/**
 * Reverse `setMemberLeft`: clear `leftAt` and re-sync identity roles.
 * Thin delegator; invariant lives in `member.aggregate.setLifecycle('returned')`.
 */
export function setMemberReturned(db: TransactionClient, memberId: MemberId, congregationId: number, actorId: number) {
  return memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'returned')
}
