import { memberAggregate } from '~/features/publishers'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Anonymize a Member: scrub PII, clear identity flags, stamp `anonymizedAt`,
 * and close any open attribution.
 *
 * Wave 5 delegator. Member-side invariants (PII scrub, identity flag reset,
 * role-assignment recompute, deletion record, audit) live in
 * `member.aggregate.anonymize`. The attribution close stays here until Wave 5
 * commit 2 introduces the Attribution aggregate + `anonymize-member.workflow`.
 */
export async function anonymizeMember(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
): Promise<void> {
  await memberAggregate.anonymize(db, memberId, congregationId, actorId)

  await db.attribution.updateMany({
    where: { publisherId: memberId, endDate: null },
    data: { endDate: new Date() },
  })
}
