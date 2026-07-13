import { memberAggregate } from '~/features/publishers/index.server'
import { requireNotLastAdmin } from '~/shared/auth/permissions.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'

export interface UpdateAccountParams {
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
export async function updateAccount(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number,
  params: UpdateAccountParams,
) {
  // If the new direct permission set drops Admin, make sure another admin
  // remains in the congregation. (False positive when the same user holds
  // Admin via both direct grant and a role — rare; workaround is to grant
  // Admin to another user first.)
  const willHaveDirectAdmin = params.permissions.includes(Permission.Admin)
  if (!willHaveDirectAdmin) {
    await requireNotLastAdmin(userId, congregationId)
  }

  // Look up the linked member ID up front so the single account update can
  // null the display-name fields when a Member owns the name. Saves a second
  // userAccount.update round-trip that the previous shape did.
  const existing = await db.userAccount.findUnique({
    where: { id_congregationId: { id: userId, congregationId } },
    select: { memberId: true },
  })
  const hasLinkedMember = existing?.memberId != null

  await db.userAccount.update({
    where: {
      id_congregationId: { id: userId, congregationId },
    },
    data: {
      // Display name lives on Member when linked; on UserAccount otherwise.
      firstname: hasLinkedMember ? null : params.firstname,
      lastname: hasLinkedMember ? null : params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: params.active,
    },
  })

  if (existing?.memberId != null) {
    await memberAggregate.updateAccountName(
      db,
      existing.memberId,
      congregationId,
      actorId,
      params.firstname,
      params.lastname,
    )
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
