import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

/**
 * Manually clear a publisher's inactive flag. Idempotent — no-op if already
 * active. Mirror of `setMemberInactive`.
 */
export async function setMemberActive(
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

  if (member.inactiveAt == null) return member

  const updated = await db.member.update({
    where: { id_congregationId: { id: memberId, congregationId } },
    data: { inactiveAt: null },
  })

  audit({
    action: AuditAction.PublisherReactivated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: memberId,
    metadata: { trigger: 'manual' },
  })

  return updated
}
