import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Mark a Member as having left the congregation.
 *
 * Sets `leftAt = now()` and re-runs identity-role sync, which drops every
 * built-in role assignment (predicates gate on `leftAt == null`). The
 * Member's flags (publisher status, baptism date, …) are preserved so a
 * later return reattaches the same identity. If the Member has a linked
 * `UserAccount` that holds management roles, those `UserRoleAssignment`
 * rows are also dropped — leaving means losing access.
 */
export async function setMemberLeft(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, leftAt: true, account: { select: { id: true } } },
  })
  if (!member) throw new NotFoundError('Member')

  if (member.leftAt != null) return member

  const updated = await db.member.update({
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { leftAt: new Date() },
  })

  await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  if (member.account) {
    await db.userRoleAssignment.deleteMany({ where: { userId: member.account.id } })
  }

  audit({
    action: AuditAction.MemberLeft,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
  })

  return updated
}
