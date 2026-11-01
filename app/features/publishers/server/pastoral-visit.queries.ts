import type { TransactionClient } from '~/shared/infra/db.server'

// `publisherGroupId` is selected for the caller's access check (the member's group leaders), not
// for display. An anonymized member is not found: anonymization is final, and a visit date written
// afterwards would never be scrubbed.
export function getPastoralVisitForMember(db: TransactionClient, memberId: number, congregationId: number) {
  return db.member.findFirst({
    where: { id: memberId, congregationId, anonymizedAt: null },
    select: { id: true, firstname: true, lastname: true, publisherGroupId: true, lastPastoralVisitAt: true },
  })
}
