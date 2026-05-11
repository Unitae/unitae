import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Reverse `setMemberLeft`: clear `leftAt` and re-sync identity roles from
 * the still-intact flags. Management roles previously attached to the
 * linked `UserAccount` are NOT restored — they were dropped on leave and
 * must be re-granted explicitly.
 */
export async function setMemberReturned(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, leftAt: true },
  })
  if (!member) throw new NotFoundError('Member')

  if (member.leftAt == null) return member

  const updated = await db.member.update({
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { leftAt: null },
  })

  await syncBuiltInRoleAssignments(db, memberId, congregationId, actorId)

  audit({
    action: AuditAction.MemberReturned,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
  })

  return updated
}
