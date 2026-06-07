import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Manually flag a publisher as inactive. Idempotent — calling again is a no-op.
 *
 * Unlike `setMemberLeft`, this does not touch role assignments: an inactive
 * publisher keeps their `isPublisher = true` flag and all built-in roles. They
 * remain fully visible to admins/elders; only public-facing display-board
 * surfaces filter them out.
 */
export async function setMemberInactive(
  db: TransactionClient,
  memberId: MemberId,
  congregationId: number,
  actorId: number,
) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, inactiveAt: true },
  })
  if (!member) throw new NotFoundError('Member')

  if (member.inactiveAt != null) return member

  const updated = await db.member.update({
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { inactiveAt: new Date() },
  })

  audit({
    action: AuditAction.PublisherInactivated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { trigger: 'manual' },
  })

  return updated
}
