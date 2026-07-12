import type { TransactionClient } from '~/shared/infra/db.server'
import * as memberAggregate from './member.aggregate'

/**
 * Update a Member's identity + status. Thin delegator; invariant lives in
 * `member.aggregate.updateIdentity`.
 */
export type UpdateMemberParams = memberAggregate.UpdateIdentityParams

export function updateMember(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateMemberParams,
) {
  return memberAggregate.updateIdentity(db, id, congregationId, actorId, params)
}
