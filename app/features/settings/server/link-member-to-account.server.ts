import { memberAggregate } from '~/features/publishers/index.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { LimitService } from '~/shared/domain/limits.server'
import { ConflictError, NotFoundError } from '~/shared/errors/app-error.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { AccountId } from '~/shared/types/branded'
import type { PublisherType } from '~/shared/types/publisher-type'

export interface LinkMemberToAccountParams {
  accountId: AccountId
  congregationId: number
  actorId: number
  // Member fields collected from the form. The display firstname/lastname
  // currently held on UserAccount fall back into the new Member if empty.
  firstname?: string
  lastname?: string
  isMale: boolean | null
  birthDate: Date | null
  baptismDate: Date | null
  isPublisher: boolean
  type: PublisherType
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  publisherGroupId: number | null
  phone: string
  address: string
}

/**
 * Convert an account-only admin / circuit-overseer login into a person who
 * also belongs to the congregation. Creates a `Member`, links it to the
 * `UserAccount` via `memberId`, and clears the display-name fallback fields
 * that were on the account (the Member is now authoritative for the name).
 *
 * Counts against the `members` limit. Throws if the account already has a
 * linked Member or if the account does not exist.
 */
export async function linkMemberToAccount(
  db: TransactionClient,
  congregation: CongregationInfo,
  params: LinkMemberToAccountParams,
) {
  const account = await db.userAccount.findFirst({
    where: { id: params.accountId, congregationId: params.congregationId },
    select: { id: true, memberId: true, firstname: true, lastname: true },
  })
  if (!account) throw new NotFoundError('UserAccount')
  if (account.memberId != null) throw new ConflictError('Account already has a linked Member')

  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('members')

  const firstname = params.firstname ?? account.firstname ?? ''
  const lastname = params.lastname ?? account.lastname ?? ''

  const member = await memberAggregate.createDirect(db, params.congregationId, params.actorId, {
    firstname,
    lastname,
    isMale: params.isMale,
    birthDate: params.birthDate,
    baptismDate: params.baptismDate,
    isPublisher: params.isPublisher,
    type: params.type,
    isHelder: params.isHelder,
    isServant: params.isServant,
    isAnointed: params.isAnointed,
    publisherGroupId: params.publisherGroupId,
    phone: params.phone,
    address: params.address,
  })

  await db.userAccount.update({
    where: { id: account.id },
    data: { memberId: member.id, firstname: null, lastname: null },
  })

  audit({
    action: AuditAction.AccountLinkedToMember,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'UserAccount',
    entityId: account.id,
    metadata: { memberId: member.id, direction: 'account_to_member' },
  })

  return { memberId: member.id, accountId: account.id }
}
