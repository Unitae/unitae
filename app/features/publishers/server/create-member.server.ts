import type { CongregationInfo } from '~/shared/domain/congregation.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import * as memberAggregate from './member.aggregate'

/**
 * Create a Member (and optionally a linked UserAccount). Thin delegator;
 * invariant lives in `member.aggregate.createMember`.
 */
export type CreateMemberParams = memberAggregate.CreateMemberParams

export function createMember(db: TransactionClient, congregation: CongregationInfo, params: CreateMemberParams) {
  return memberAggregate.createMember(db, congregation, params)
}
