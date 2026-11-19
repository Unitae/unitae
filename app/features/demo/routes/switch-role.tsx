import { redirect } from 'react-router'
import { commitSession, establishAuthenticatedSession, getSession } from '~/features/authentication/index.server'
import { isDemoRole } from '~/features/demo'
import { demoAccountFor, isDemoCongregation } from '~/features/demo/index.server'
import { congregationContext, withScopeFromContext } from '~/shared/auth/route-context.server'

import type { Route } from './+types/switch-role'

/**
 * « Changer de rôle » in a demo copy: signs the visitor in as the copy's login for another role. Only in a demo copy,
 * where every login is invented and anyone holding the copy may try any role.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const congregation = context.get(congregationContext)
  if (!isDemoCongregation(congregation)) throw new Response(null, { status: 404 })

  const role = (await request.formData()).get('role')
  if (!isDemoRole(role)) throw new Response(null, { status: 400 })

  const account = await withScopeFromContext(context, (db, congregationId) => demoAccountFor(db, congregationId, role))
  if (account == null) throw new Response(null, { status: 404 })

  const session = await getSession(request.headers.get('Cookie'))
  await establishAuthenticatedSession(session, account)
  throw redirect('/', { headers: { 'Set-Cookie': await commitSession(session) } })
}
