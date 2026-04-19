// Intentional cross-feature import: authorization depends on authentication for session management
import { getSession } from '~/features/authentication/server/session.server'
import { unscopedDb } from '~/shared/infra/db.server'
import type { Role } from '~/shared/types/role'

export async function verifyRole(request: Request, roleKey: Role) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))
  if (Number.isNaN(userId)) {
    return false
  }

  const user = await unscopedDb.user.findUnique({ where: { id: userId }, select: { congregationId: true } })
  if (!user) {
    return false
  }

  const { congregationId } = user

  const adminRole = await unscopedDb.congregationUserRole.findFirst({
    where: {
      userId,
      congregationId,
      role: { key: 'admin' },
    },
  })

  if (adminRole != null) {
    return true
  }

  const role = await unscopedDb.congregationUserRole.findFirst({
    where: {
      userId,
      congregationId,
      role: { key: roleKey },
    },
  })

  return role != null
}
