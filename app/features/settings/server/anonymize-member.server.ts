import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'
import { anonymizeMemberWorkflow } from './anonymize-member.workflow'

/**
 * Anonymize a Member. Thin delegator; the cross-aggregate orchestration
 * (Attribution close + Member PII scrub) lives in
 * `anonymize-member.workflow.ts`.
 */
export function anonymizeMember(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
): Promise<void> {
  return anonymizeMemberWorkflow(db, memberId, congregationId, actorId)
}
