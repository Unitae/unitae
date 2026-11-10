import * as m from '~/i18n/paraglide/messages'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { formatPersonName } from '~/shared/utils/format-person-name'
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

/**
 * A member's group membership, once it is clear they may go to `groupId` (a group, or none with `null`). A group's
 * overseer and deputy belong to the group they lead: taking them out of it throws a ConflictError whose message says
 * to change that group's leaders first. Staying in the group they are in is always allowed.
 */
export async function _checkGroupMove(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  groupId: number | null,
) {
  const member = await _loadGroupMembership(db, memberId, congregationId)
  const led = member.responsibleFor ?? member.deputyFor
  if (member.publisherGroupId !== groupId && led && led.id !== groupId) {
    throw new ConflictError(m.groups_members_error_leads_group({ person: formatPersonName(member), name: led.name }))
  }
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
