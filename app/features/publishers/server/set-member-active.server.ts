import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import * as memberAggregate from './member.aggregate'

/**
 * Manually clear a publisher's inactive flag. Thin delegator; invariant
 * lives in `member.aggregate.setLifecycle('active')`.
 */
export function setMemberActive(db: TransactionClient, memberId: MemberId, congregationId: number, actorId: number) {
  return memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'active')
}
