import { verifySession } from '~/features/authentication/server/session.server'
import type { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

import { createScopedDb, restoreCongregationContext } from './db.server'

/**
 * Authenticates the user, checks roles, and returns a tenant-scoped db client.
 *
 * Combines verifySession + verifyRole into a single call. Returns a scoped `db`
 * client that reads congregationId from a closure (not AsyncLocalStorage), making
 * it immune to the Prisma 7 pg adapter breaking ALS propagation.
 *
 * Use this in all authenticated route loaders and actions.
 */
export async function authenticateAndAuthorize(request: Request, roles: Role[] = []) {
  const { currentUser, congregation, session } = await verifySession(request)

  const resolved = await Promise.all(roles.map(async role => [role, await verifyRole(request, role)] as const))
  const permissions = new Set(resolved.filter(([, granted]) => granted).map(([role]) => role))

  // Also restore ALS for any code that still reads from it (e.g. legacy db import)
  restoreCongregationContext(currentUser.congregationId)

  return {
    currentUser,
    congregation,
    session,
    can: (role: Role) => permissions.has(role),
    db: createScopedDb(currentUser.congregationId),
  }
}
