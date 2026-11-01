import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { MEMBER_IDENTITY_SELECT, type MemberIdentityFlags } from './member-identity'

// Precondition / lookup helpers shared by member.aggregate.ts. Extracted into a companion file to
// keep the aggregate under its file-size budget. Reads only (findFirst) — no mutations live here.

export async function _loadMemberIdentity(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
): Promise<MemberIdentityFlags> {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: MEMBER_IDENTITY_SELECT,
  })
  if (!member) throw new NotFoundError('Member')
  return member
}

/** A member's group, and the group they oversee or assist if any. */
export async function _loadGroupMembership(db: TransactionClient, memberId: number, congregationId: number) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: {
      firstname: true,
      lastname: true,
      publisherGroupId: true,
      responsibleFor: { select: { id: true, name: true } },
      deputyFor: { select: { id: true, name: true } },
    },
  })
  if (!member) throw new NotFoundError('Member')
  return member
}

// PublisherGroup.responsibleId is a required unique FK — we cannot null it. The admin must
// reassign the group's responsibility BEFORE anonymize, otherwise the group would retain an
// inbound pointer to the scrubbed row.
export async function _ensureMemberIsNotGroupResponsible(db: TransactionClient, memberId: number): Promise<void> {
  const group = await db.publisherGroup.findFirst({
    where: { responsibleId: memberId },
    select: { id: true, name: true },
  })
  if (group) {
    throw new ConflictError(
      `Cannot anonymize a group responsible — reassign "${group.name}" (group #${group.id}) first`,
    )
  }
}
