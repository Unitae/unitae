import { type RouterContext, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { verifyPermission } from '~/shared/auth/permissions.server'
import { congregationContext, permissionsContext, userContext } from '~/shared/auth/route-context.server'
import { hasDataProcessingConsent } from '~/shared/domain/consent.server'
import type { Permission } from '~/shared/types/permission'

interface MiddlewareArgs {
  request: Request
  context: {
    set<C extends RouterContext>(context: C, value: C extends RouterContext<infer T> ? T : never): void
  }
}

async function enforceGdprConsent(userId: number): Promise<void> {
  const hasConsent = await hasDataProcessingConsent(userId)
  if (!hasConsent) throw redirect('/consent')
}

/**
 * Auth middleware that verifies the session, resolves permissions,
 * checks GDPR consent, and sets typed context for downstream loaders/actions.
 *
 * Apply to the authenticated layout route — it cascades to all child routes.
 */
export function requireAuth(roles: Permission[] = []) {
  return async ({ request, context }: MiddlewareArgs, next: () => Promise<Response>) => {
    const { currentUser, congregation } = await verifySession(request)

    // Resolve all role permissions in parallel
    const resolved = await Promise.all(roles.map(async role => [role, await verifyPermission(request, role)] as const))
    const permissions = new Set<Permission>(resolved.filter(([, granted]) => granted).map(([role]) => role))

    await enforceGdprConsent(currentUser.id)

    // Set typed context for downstream loaders/actions
    context.set(userContext, currentUser)
    context.set(congregationContext, congregation)
    context.set(permissionsContext, permissions)

    return next()
  }
}
