import { redirect } from 'react-router'

import { dismissOnboarding } from '~/features/dashboard/server/dismiss-onboarding.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/dismiss-onboarding'

export function loader() {
  throw redirect('/')
}

// Posted by the "Premiers pas" checklist's close button. Gated like the checklist itself, which
// only admins see.
export function action({ context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  requirePermission(permissions, Permission.CanDoAnything)

  return withScopeFromContext(context, async db => {
    await dismissOnboarding(db, currentUser.id, currentUser.congregationId, currentUser.id)
    return { ok: true }
  })
}
