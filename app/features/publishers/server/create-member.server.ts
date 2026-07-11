import { createPasswordResetToken } from '~/features/authentication/server/invalidate-account-password.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { CongregationInfo } from '~/shared/domain/congregation.server'
import { LimitService } from '~/shared/domain/limits.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import type { PublisherType } from '~/shared/types/publisher-type'
import { stripDiacritics } from '~/shared/utils/strip-diacritics'

export interface CreateMemberParams {
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
  congregationId: number
  phone: string
  address: string
  actorId: number
}

/**
 * Create a Member. If `email` is provided, also create a linked UserAccount
 * with a placeholder password and a password-reset token (caller is expected
 * to email the link). When `email` is null/empty, the Member exists without
 * a login (offline publisher).
 */
export async function createMember(db: TransactionClient, congregation: CongregationInfo, params: CreateMemberParams) {
  const limits = new LimitService(db, congregation)
  await limits.errorIfWouldGoOverLimit('members')

  const member = await db.member.create({
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      firstnameNormalized: stripDiacritics(params.firstname),
      lastnameNormalized: stripDiacritics(params.lastname),
      isMale: params.gender === 'male',
      baptismDate: params.baptismDate ? new Date(params.baptismDate) : null,
      birthDate: params.birthDate ? new Date(params.birthDate) : null,
      isHelder: params.isHelder,
      isServant: params.isServant,
      isAnointed: params.isAnointed,
      publisherGroupId: Number.isNaN(params.groupId) ? null : params.groupId,
      type: params.type,
      isPublisher: true,
      congregationId: params.congregationId,
      phone: params.phone,
      address: params.address,
    },
  })

  if (params.email && params.email.length > 0) {
    const account = await db.userAccount.create({
      data: {
        memberId: member.id,
        email: params.email.toLocaleLowerCase(),
        password: '',
        active: true,
        emailVerifiedAt: new Date(),
        congregationId: params.congregationId,
      },
    })
    // Send a reset link so the publisher can pick a password
    await createPasswordResetToken(account.id, db)
  }

  await syncBuiltInRoleAssignments(db, member.id, params.congregationId, params.actorId)

  audit({
    action: AuditAction.PublisherCreated,
    congregationId: params.congregationId,
    actorId: params.actorId,
    entityType: 'Member',
    entityId: member.id,
  })

  return member
}
