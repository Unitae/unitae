import { AuditAction, audit } from '~/shared/domain/audit.server'
import { NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'

/**
 * Remove the login from a Member: deletes the linked UserAccount entirely
 * (tokens + permissions + management role assignments cascade via FK
 * onDelete). The Member row itself stays in place — the person is still
 * part of the congregation, just without a way to log in.
 */
export async function unlinkAccountFromMember(
  db: TransactionClient,
  memberId: number,
  congregationId: number,
  actorId: number,
) {
  const member = await db.member.findFirst({
    where: { id: memberId, congregationId },
    select: { id: true, account: { select: { id: true, email: true } } },
  })
  if (!member) throw new NotFoundError('Member')
  if (!member.account) return null

  const accountId = member.account.id
  await db.userAccount.delete({ where: { id: accountId } })

  audit({
    action: AuditAction.AccountUnlinkedFromMember,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: accountId,
    metadata: { memberId, email: member.account.email },
  })

  return { accountId }
}
