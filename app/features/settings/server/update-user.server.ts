import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { syncBuiltInRoleAssignments } from '~/shared/domain/built-in-roles.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

export interface UpdateUserParams {
  firstname: string
  lastname: string
  email: string
  active: boolean
  permissions: string[]
}

/**
 * Update a UserAccount and, when linked, the bound Member's name.
 *
 * Display name (firstname/lastname) lives on Member when the account is
 * linked; on UserAccount itself for admin / circuit-overseer accounts.
 */
export async function updateUser(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number,
  params: UpdateUserParams,
) {
  // If the new direct permission set drops Admin, make sure another admin
  // remains in the congregation. (False positive when the same user holds
  // Admin via both direct grant and a role — rare; workaround is to grant
  // Admin to another user first.)
  const willHaveDirectAdmin = params.permissions.includes(Permission.Admin)
  if (!willHaveDirectAdmin) {
    await requireNotLastAdmin(userId, congregationId)
  }

  const account = await db.userAccount.update({
    where: {
      id_congregationId: { id: userId, congregationId },
    },
    data: {
      // Only used when memberId is null (admin / CO accounts)
      firstname: params.firstname,
      lastname: params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: params.active,
    },
    select: { memberId: true },
  })

  if (account.memberId != null) {
    await db.member.update({
      where: { id: account.memberId },
      data: {
        firstname: params.firstname,
        lastname: params.lastname,
      },
    })
    // Account.firstname/lastname stay null when linked to a Member
    await db.userAccount.update({
      where: { id_congregationId: { id: userId, congregationId } },
      data: { firstname: null, lastname: null },
    })
    await syncBuiltInRoleAssignments(db, account.memberId, congregationId, actorId)
  }

  // Update congregation-scoped permissions: delete existing, create new
  await db.congregationUserPermission.deleteMany({
    where: { userId, congregationId },
  })

  const permissionRecords = await db.permission.findMany({
    where: { key: { in: params.permissions } },
  })

  if (permissionRecords.length > 0) {
    await db.congregationUserPermission.createMany({
      data: permissionRecords.map(permission => ({
        userId,
        permissionId: permission.id,
        congregationId,
      })),
    })
  }

  audit({
    action: AuditAction.UserUpdated,
    congregationId,
    actorId,
    entityType: 'UserAccount',
    entityId: userId,
    metadata: { permissions: params.permissions },
  })
}
