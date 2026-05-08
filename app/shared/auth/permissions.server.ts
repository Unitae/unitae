// Cross-module import: permissions resolution depends on authentication for session management
import { getSession } from '~/features/authentication/server/session.server'
import { unscopedDb } from '~/shared/infra/db.server'
import type { Permission } from '~/shared/types/permission'

export async function verifyPermission(request: Request, permissionKey: Permission) {
  const session = await getSession(request.headers.get('Cookie'))
  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)
  if (!rawUserId || Number.isNaN(userId) || userId <= 0) {
    return false
  }

  const user = await unscopedDb.user.findUnique({ where: { id: userId }, select: { congregationId: true } })
  if (!user) {
    return false
  }

  const { congregationId } = user

  const adminPermission = await unscopedDb.congregationUserPermission.findFirst({
    where: {
      userId,
      congregationId,
      permission: { key: 'admin' },
    },
  })

  if (adminPermission != null) {
    return true
  }

  const permission = await unscopedDb.congregationUserPermission.findFirst({
    where: {
      userId,
      congregationId,
      permission: { key: permissionKey },
    },
  })

  return permission != null
}
