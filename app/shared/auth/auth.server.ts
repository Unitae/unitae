import { verifySession } from '~/features/authentication/server/session.server'
import { resolveEffectivePermissions } from '~/shared/auth/permissions.server'
import type { Permission } from '~/shared/types/permission'

/**
 * Authenticates the user and checks roles.
 *
 * Returns congregationId for use with withScope() and explicit query scoping.
 * RLS + compound unique indexes handle tenant isolation at the DB level.
 */
export async function authenticateAndAuthorize(request: Request, roles: Permission[] = []) {
  const { currentUser, congregation, session } = await verifySession(request)
  const granted = await resolveEffectivePermissions(currentUser.id, currentUser.congregationId)
  const requested = new Set(roles.filter(role => granted.has(role)))

  return {
    currentUser,
    congregation,
    congregationId: currentUser.congregationId,
    session,
    can: (role: Permission) => requested.has(role),
  }
}
