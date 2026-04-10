import { verifySession } from '~/features/authentication/server/session.server'
import type { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

import { restoreCongregationContext } from './db.server'

/**
 * Authenticates the user, checks roles, and restores the congregation context.
 *
 * Combines verifySession + verifyRole + restoreCongregationContext into a single call.
 * Use this in all authenticated route loaders and actions.
 */
export async function authenticateAndAuthorize(request: Request, roles: Role[] = []) {
  const { currentUser, congregation, session } = await verifySession(request)

  const resolved = await Promise.all(roles.map(async (role) => [role, await verifyRole(request, role)] as const))
  const permissions = new Set(resolved.filter(([, granted]) => granted).map(([role]) => role))

  // Restore ALS context after all auth/role Prisma queries.
  // The Prisma 7 pg adapter breaks AsyncLocalStorage propagation after async operations.
  restoreCongregationContext(currentUser.congregationId)

  return {
    currentUser,
    congregation,
    session,
    can: (role: Role) => permissions.has(role),
  }
}
