import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateUserParams {
  firstname: string
  lastname: string
  email: string
  active: boolean
  permissions: string[]
}

export async function updateUser(
  db: TransactionClient,
  userId: number,
  congregationId: number,
  actorId: number,
  params: UpdateUserParams,
) {
  await db.user.update({
    where: {
      id_congregationId: { id: userId, congregationId },
    },
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: params.active,
    },
  })

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
    entityType: 'User',
    entityId: userId,
    metadata: { permissions: params.permissions },
  })
}
