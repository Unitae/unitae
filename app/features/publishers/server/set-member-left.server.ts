import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import * as memberAggregate from './member.aggregate'

/**
 * Mark a Member as having left the congregation. Thin delegator kept for
 * verb-noun discoverability; the invariant (leftAt + role sync + drop
 * account roles) lives in `member.aggregate.setLifecycle('left')`.
 */
export function setMemberLeft(db: TransactionClient, memberId: MemberId, congregationId: number, actorId: number) {
  return memberAggregate.setLifecycle(db, memberId, congregationId, actorId, 'left')
}
