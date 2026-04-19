import { AuditAction, audit } from '~/shared/domain/audit.server'
import type { TransactionClient } from '~/shared/infra/db.server'

export interface UpdateUserParams {
  firstname: string
  lastname: string
  email: string
  active: boolean
  roles: string[]
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
      // biome-ignore lint/style/useNamingConvention: prisma compound key
      id_congregationId: { id: userId, congregationId },
    },
    data: {
      firstname: params.firstname,
      lastname: params.lastname,
      email: params.email.toLocaleLowerCase(),
      active: params.active,
    },
  })

  // Update congregation-scoped roles: delete existing, create new
  await db.congregationUserRole.deleteMany({
    where: { userId, congregationId },
  })

  const roleRecords = await db.userRole.findMany({
    where: { key: { in: params.roles } },
  })

  if (roleRecords.length > 0) {
    await db.congregationUserRole.createMany({
      data: roleRecords.map(role => ({
        userId,
        roleId: role.id,
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
    metadata: { roles: params.roles },
  })
}
