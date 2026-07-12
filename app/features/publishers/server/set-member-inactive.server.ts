import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import * as memberAggregate from './member.aggregate'

/**
 * Manually flag a publisher as inactive. Thin delegator; invariant lives
 * in `member.aggregate.setLifecycle('inactive')`.
 */
export function setMemberInactive(db: TransactionClient, memberId: MemberId, congregationId: number, actorId: number) {
  return memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'inactive')
}
