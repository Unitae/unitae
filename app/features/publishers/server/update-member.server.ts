import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'

export interface UpdateMemberParams {
  firstname: string
  lastname: string
  email: string | null
  gender: string
  birthDate: string | null
  baptismDate: string | null
  isHelder: boolean
  isServant: boolean
  isAnointed: boolean
  groupId: number | null
  type: PublisherType
  phone: string
  address: string
}

/**
 * Update a Member's identity + status. Email — when the Member has a linked
 * UserAccount — is set on that account; null/empty leaves it untouched.
 */
export async function updateMember(
  db: TransactionClient,
  id: number,
  congregationId: number,
  actorId: number,
  params: UpdateMemberParams,
) {
  const publisher = await db.member.update({
    where: {
      id_congregationId: { id, congregationId },
    },
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      isMale: params.gender === 'male',
      baptismDate: params.baptismDate ? new Date(params.baptismDate) : null,
      birthDate: params.birthDate ? new Date(params.birthDate) : null,
      isHelder: params.isHelder,
      isServant: params.isServant,
      isAnointed: params.isAnointed,
      publisherGroupId: Number.isNaN(params.groupId) ? null : params.groupId,
      type: params.type,
      address: params.address,
      phone: params.phone,
    },
  })

  if (params.email && params.email.length > 0) {
    const existingAccount = await db.userAccount.findUnique({ where: { memberId: id } })
    if (existingAccount) {
      await db.userAccount.update({
        where: { id: existingAccount.id },
        data: { email: params.email.toLocaleLowerCase() },
      })
    }
  }

  await syncBuiltInRoleAssignments(db, id, congregationId, actorId)

  audit({
    action: AuditAction.PublisherUpdated,
    congregationId,
    actorId,
    entityType: 'Member',
    entityId: id,
  })

  return publisher
}
