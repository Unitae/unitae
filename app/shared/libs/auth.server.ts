import { verifySession } from '~/features/authentication/server/session.server'
import type { Role } from '~/shared/types/role'
import { verifyRole } from '~/features/authorization/server/verify-role.server'

/**
 * Authenticates the user and checks roles.
 *
 * Returns congregationId for use with withScope() and explicit query scoping.
 * RLS + compound unique indexes handle tenant isolation at the DB level.
 */
export async function authenticateAndAuthorize(request: Request, roles: Role[] = []) {
  const { currentUser, congregation, session } = await verifySession(request)

  const resolved = await Promise.all(roles.map(async role => [role, await verifyRole(request, role)] as const))
  const permissions = new Set(resolved.filter(([, granted]) => granted).map(([role]) => role))

  return {
    currentUser,
    congregation,
    congregationId: currentUser.congregationId,
    session,
    can: (role: Role) => permissions.has(role),
  }
}
