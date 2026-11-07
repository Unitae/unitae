import { redirect } from 'react-router'

import { dismissOnboarding } from '~/features/dashboard/server/dismiss-onboarding.server'
import { currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'

import type { Route } from './+types/dismiss-onboarding'

export function loader() {
  throw redirect('/')
}

// Posted by the "Premiers pas" checklist's close button. Anyone signed in may close their own
// checklist: it now carries personal steps for every responsibility holder, not only the admin's.
export function action({ context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    await dismissOnboarding(db, currentUser.id, currentUser.congregationId, currentUser.id)
    return { ok: true }
  })
}
