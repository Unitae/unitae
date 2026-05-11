import { type RouterContext, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { resolveEffectivePermissions } from '~/shared/auth/permissions.server'
import { congregationContext, currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'
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
 *
 * The optional `_required` parameter is retained for call-site compatibility
 * but no longer used for filtering: `permissionsContext` is the user's full
 * granted set, so `permissions.has(Permission.X)` answers honestly regardless
 * of which permissions a layout route happened to list.
 */
export function requireAuth(_required: Permission[] = []) {
  return async ({ request, context }: MiddlewareArgs, next: () => Promise<Response>) => {
    const { currentUser, congregation } = await verifySession(request)

    const permissions = await resolveEffectivePermissions(currentUser.id, currentUser.congregationId)

    await enforceGdprConsent(currentUser.id)

    context.set(currentAccountContext, currentUser)
    context.set(congregationContext, congregation)
    context.set(permissionsContext, permissions)

    return next()
  }
}
