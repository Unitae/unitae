import type { TransactionClient } from '~/shared/infra/db.server'

// `publisherGroupId` is selected for the caller's access check (the member's group leaders), not
// for display.
export function getPastoralVisitForMember(db: TransactionClient, memberId: number, congregationId: number) {
  return db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, firstname: true, lastname: true, publisherGroupId: true, lastPastoralVisitAt: true },
  })
}
