import { createPasswordResetToken } from '~/features/authentication/index.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { ActorPermissions } from '~/shared/domain/role-grant-limits.server'
import { assertMayOpenAccessForRecord } from '~/shared/domain/role-membership.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { MemberId } from '~/shared/types/branded'

interface LinkAccountToMemberParams {
  memberId: MemberId
  email: string
  congregationId: number
  actorId: number
  /** The rights of whoever opens the access: the record's roles start granting theirs to the new login. */
  actorPermissions: ActorPermissions
}

/**
 * Add a login to an existing Member. Creates a UserAccount with an empty
 * password and a fresh password-reset token (caller is expected to send
 * the email). Throws `ConflictError` if the Member already has an account
 * or if the email is already taken, and `GrantBeyondActorError` when the
 * record holds roles whose rights the actor does not have: the new login
 * would receive them.
 */
export async function linkAccountToMember(
  db: TransactionClient,
  params: LinkAccountToMemberParams,
): Promise<{ accountId: number; resetToken: string; memberFirstname: string }> {
  const member = await db.member.findFirst({
    where: { id: params.memberId, congregationId: params.congregationId },
    select: { id: true, firstname: true, account: { select: { id: true } } },
  })
  if (!member) throw new NotFoundError('Member')
  if (member.account) throw new ConflictError('Member already has a linked account')

  await assertMayOpenAccessForRecord(db, params.memberId, params.congregationId, params.actorPermissions)

  const normalizedEmail = params.email.toLocaleLowerCase()
  const emailTaken = await db.userAccount.findFirst({ where: { email: normalizedEmail } })
  if (emailTaken) throw new ConflictError('Email already in use')

  const account = await db.userAccount.create({
    data: {
      memberId: params.memberId,
      email: normalizedEmail,
      password: '',
      active: true,
      // emailVerifiedAt stays null — the operator-supplied address is unverified
      // until the recipient completes the password-reset flow we kick off below.
      emailVerifiedAt: null,
      congregationId: params.congregationId,
    },
  })

  const resetToken = await createPasswordResetToken(account.id, db)

  audit({
    action: AuditAction.AccountLinkedToMember,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'UserAccount',
    entityId: account.id,
    metadata: { memberId: params.memberId },
  })

  return { accountId: account.id, resetToken, memberFirstname: member.firstname }
}
