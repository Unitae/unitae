import { getSession } from '~/features/authentication/server/session.server'
import type { Role } from '~/features/authorization/model/roles.type'

import { congregationContext, unscopedDb } from '~/shared/libs/db.server'

export async function verifyRole(request: Request, roleKey: Role) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))
  if (Number.isNaN(userId)) {
    return false
  }

  const ctx = congregationContext.getStore()
  if (!ctx) {
    return false
  }

  const adminRole = await unscopedDb.congregationUserRole.findFirst({
    where: {
      userId,
      congregationId: ctx.congregationId,
      role: { key: 'admin' },
    },
  })

  if (adminRole != null) {
    return true
  }

  const role = await unscopedDb.congregationUserRole.findFirst({
    where: {
      userId,
      congregationId: ctx.congregationId,
      role: { key: roleKey },
    },
  })

  return role != null
}
