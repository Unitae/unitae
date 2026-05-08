import { verifySession } from '~/features/authentication/server/session.server'
import { verifyPermission } from '~/shared/auth/permissions.server'
import type { Permission } from '~/shared/types/permission'

/**
 * Authenticates the user and checks roles.
 *
 * Returns congregationId for use with withScope() and explicit query scoping.
 * RLS + compound unique indexes handle tenant isolation at the DB level.
 */
export async function authenticateAndAuthorize(request: Request, roles: Permission[] = []) {
  const { currentUser, congregation, session } = await verifySession(request)

  const resolved = await Promise.all(roles.map(async role => [role, await verifyPermission(request, role)] as const))
  const permissions = new Set(resolved.filter(([, granted]) => granted).map(([role]) => role))

  return {
    currentUser,
    congregation,
    congregationId: currentUser.congregationId,
    session,
    can: (role: Permission) => permissions.has(role),
  }
}
