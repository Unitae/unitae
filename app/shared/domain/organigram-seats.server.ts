import { AuditAction, audit } from '~/shared/domain/audit.server'
import { isIdentityRoleKey, isServiceCommitteePostKey } from '~/shared/domain/built-in-roles.server'
import type { SeatKind } from '~/shared/domain/organigram.queries'
import { syncServiceCommitteeMembers } from '~/shared/domain/service-committee.server'
import { ForbiddenError, NotFoundError, ValidationError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

// Who sits in a node, as opposed to how the nodes are arranged.
//
// Split from `organigram.server.ts` because the two answer different questions and the file was
// within three lines of its budget: that one moves boxes, this one puts people in them.

export const ORGANIGRAM_ERRORS = {
  memberHasNoAccount: 'Cette personne n’a pas de compte : elle ne peut pas encore être placée dans l’organigramme.',
  postRequiresElder: 'Le comité de service est composé de trois anciens : cette personne n’est pas ancien.',
  rosterIsSynced: 'Cette liste est synchronisée automatiquement : on n’y place personne à la main.',
} as const

async function requireRole(db: TransactionClient, roleId: number, congregationId: number) {
  const role = await db.role.findFirst({
    where: { id: roleId, congregationId },
    select: { id: true, key: true, parentRoleId: true, isSinglePerson: true },
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
  // Identity memberships are synced from Member flags, never granted: a hand-written
  // `UserRoleAssignment` on one would hand out the roster's permissions and outlive every sync.
  // `addUserToRole` refuses these, and this path must be no wider than that one.
  if (isIdentityRoleKey(role.key)) throw new ForbiddenError(ORGANIGRAM_ERRORS.rosterIsSynced)
  const userId = await requireSeatableAccount(db, memberId, congregationId)

  // A personal role has one titulaire and, optionally, adjoints: a plain «membre» seat does not
  // exist on it, so an unqualified request means the titular seat. The committee posts carry the
  // flag; the key check backstops rows restored from an archive that predates it.
  const isPost = isServiceCommitteePostKey(role.key)
  const isSingle = role.isSinglePerson || isPost
  const seatKind = isSingle && kind !== 'deputy' ? 'leader' : kind

  // The three committee titulaires are elders. The rule is about who *holds* the post, not who
  // helps them — an adjoint need not be an elder. Checked before any write, so a refusal never
  // leaves the post vacant.
  if (isPost && seatKind === 'leader') {
    const isElder = await db.memberRoleAssignment.findFirst({
      where: { memberId, congregationId, role: { key: 'elder' } },
      select: { memberId: true },
    })
    if (!isElder) throw new ValidationError('memberId', ORGANIGRAM_ERRORS.postRequiresElder)
  }

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

  // Seating a new titulaire *is* the handover: the outgoing holder leaves the role, and with
  // it the permissions it carries. Only the titular seat is swept — the adjoints stay through
  // a handover, on the committee posts as on any personal role.
  if (isSingle && seatKind === 'leader') {
    await db.userRoleAssignment.deleteMany({ where: { roleId, congregationId, kind: 'leader', NOT: { userId } } })
  }
  // The committee is made of its three titulaires, so its membership follows the posts.
  if (isPost) {
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
    metadata: { added: [], removed: [role.key] },
  })
}
