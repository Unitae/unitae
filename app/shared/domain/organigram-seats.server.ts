import { AuditAction, audit } from '~/shared/domain/audit.server'
import { isServiceCommitteePostKey } from '~/shared/domain/built-in-roles.server'
import type { SeatKind } from '~/shared/domain/organigram.queries'
import { syncServiceCommitteeMembers } from '~/shared/domain/service-committee.server'
import { NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Who sits in a node, as opposed to how the nodes are arranged.
//
// Split from `organigram.server.ts` because the two answer different questions and the file was
// within three lines of its budget: that one moves boxes, this one puts people in them.

export const ORGANIGRAM_ERRORS = {
  memberHasNoAccount: 'Cette personne n’a pas de compte : elle ne peut pas encore être placée dans l’organigramme.',
  postRequiresElder: 'Le comité de service est composé de trois anciens : cette personne n’est pas ancien.',
} as const

async function requireRole(db: TransactionClient, roleId: number, congregationId: number) {
  const role = await db.role.findFirst({
    where: { id: roleId, congregationId },
    select: { id: true, key: true, parentRoleId: true },
  })
  if (!role) throw new NotFoundError('Role', roleId)
  return role
}

async function requireSeatableAccount(db: TransactionClient, memberId: number, congregationId: number) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, account: { select: { id: true } } },
  })
  if (!member) throw new NotFoundError('Member', memberId)
  // Seats are account-bound until role assignments move onto Member. Say so plainly rather
  // than letting the insert fail on a foreign key.
  if (!member.account) throw new ValidationError('memberId', ORGANIGRAM_ERRORS.memberHasNoAccount)
  return member.account.id
}

export interface SeatInput {
  roleId: number
  memberId: number
  kind: SeatKind
}

/** Put someone in a node, or change the seat they already occupy there. */
export async function seatMember(
  db: TransactionClient,
  { roleId, memberId, kind }: SeatInput,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  const userId = await requireSeatableAccount(db, memberId, congregationId)

  // The three committee posts are single-person and elder-only. Both rules are checked before
  // any write, so a refusal never leaves the post vacant.
  const isPost = isServiceCommitteePostKey(role.key)
  if (isPost) {
    const isElder = await db.memberRoleAssignment.findFirst({
      where: { memberId, congregationId, role: { key: 'elder' } },
      select: { memberId: true },
    })
    if (!isElder) throw new ValidationError('memberId', ORGANIGRAM_ERRORS.postRequiresElder)
  }

  // A post has no membre/adjoint distinction to make — one person holds it.
  const seatKind = isPost ? 'leader' : kind

  const existing = await db.userRoleAssignment.findFirst({
    where: { userId, roleId, congregationId },
    select: { userId: true, kind: true },
  })

  // Deliberately not an early return when the seat is unchanged: the committee reconcile below
  // must still run. That makes seating self-healing — it repairs a committee whose membership
  // drifted, rather than requiring someone to guess which seat to poke.
  const unchanged = existing != null && existing.kind === seatKind
  if (existing && !unchanged) {
    await db.userRoleAssignment.update({ where: { userId_roleId: { userId, roleId } }, data: { kind: seatKind } })
  } else if (!existing) {
    await db.userRoleAssignment.create({ data: { userId, roleId, congregationId, kind: seatKind } })
  }

  // Seating a new coordinator *is* the handover: the outgoing holder leaves the post, and with
  // it the permissions the post carries. That is the behaviour the whole feature was built for,
  // so it happens here rather than asking the admin to remember to unseat first.
  if (isPost) {
    await db.userRoleAssignment.deleteMany({ where: { roleId, congregationId, NOT: { userId } } })
    // The committee is made of its three posts, so its membership follows them.
    await syncServiceCommitteeMembers(db, congregationId, actorId)
  }

  if (!unchanged) {
    audit({
      action: AuditAction.UserRoleAssignmentChanged,
      congregationId,
      actorId,
      entityType: 'User',
      entityId: userId,
      metadata: { added: existing ? [] : [role.key], removed: [], kind: seatKind },
    })
  }
}

/** Take someone out of one node, leaving every other seat they hold untouched. */
export async function unseatMember(
  db: TransactionClient,
  roleId: number,
  memberId: number,
  congregationId: number,
  actorId: number,
): Promise<void> {
  const role = await requireRole(db, roleId, congregationId)
  const userId = await requireSeatableAccount(db, memberId, congregationId)

  await db.userRoleAssignment.deleteMany({ where: { userId, roleId, congregationId } })

  // Leaving a post leaves the committee. Half a handover is worse than none: the permissions
  // the post carries would stay with someone who no longer holds it.
  if (isServiceCommitteePostKey(role.key)) {
    await syncServiceCommitteeMembers(db, congregationId, actorId)
  }

  audit({
    action: AuditAction.UserRoleAssignmentChanged,
    congregationId,
    actorId,
    entityType: 'User',
    entityId: userId,
    metadata: { added: [], removed: [String(roleId)] },
  })
}
