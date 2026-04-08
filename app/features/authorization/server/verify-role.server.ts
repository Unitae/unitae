import { getSession } from '~/features/authentication/server/session.server'
import type { Role } from '~/features/authorization/model/roles.type'

import { congregationContext, unscopedDb } from '~/shared/libs/db.server'

export async function verifyRole(request: Request, roleKey: Role) {
  const session = await getSession(request.headers.get('Cookie'))
  const userId = Number(session.get('userId'))
  if (Number.isNaN(userId)) {
    return false
  }

  // Prefer AsyncLocalStorage context, but fall back to looking up the user's congregationId
  // directly. The pg adapter in Prisma 7 can break AsyncLocalStorage context propagation
  // after awaited queries, causing enterWith() in verifySession to not be visible here.
  let congregationId = congregationContext.getStore()?.congregationId
  if (!congregationId) {
    const user = await unscopedDb.user.findUnique({ where: { id: userId }, select: { congregationId: true } })
    if (!user) {
      return false
    }
    congregationId = user.congregationId
  }

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
