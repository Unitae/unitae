import { type RouterContext, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { hasDataProcessingConsent } from '~/shared/domain/consent.server'
import { congregationContext, permissionsContext, userContext } from '~/shared/auth/route-context.server'
import type { Role } from '~/shared/types/role'

interface MiddlewareArgs {
  request: Request
  context: {
    set<C extends RouterContext>(context: C, value: C extends RouterContext<infer T> ? T : never): void
  }
}

/**
 * Auth middleware that verifies the session, resolves permissions,
 * checks GDPR consent, and sets typed context for downstream loaders/actions.
 *
 * Apply to the authenticated layout route — it cascades to all child routes.
 */
export function requireAuth(roles: Role[] = []) {
  return async ({ request, context }: MiddlewareArgs, next: () => Promise<Response>) => {
    const { currentUser, congregation } = await verifySession(request)

    // Resolve all role permissions in parallel
    const resolved = await Promise.all(roles.map(async role => [role, await verifyRole(request, role)] as const))
    const permissions = new Set<Role>(resolved.filter(([, granted]) => granted).map(([role]) => role))

    // Check GDPR consent
    const hasConsent = await hasDataProcessingConsent(currentUser.id)
    if (!hasConsent) {
      throw redirect('/consent')
    }

    // Set typed context for downstream loaders/actions
    context.set(userContext, currentUser)
    context.set(congregationContext, congregation)
    context.set(permissionsContext, permissions)

    return next()
  }
}
