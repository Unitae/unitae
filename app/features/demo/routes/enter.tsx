import { Clock } from 'lucide-react'
import { data, redirect } from 'react-router'
import { commitSession, establishAuthenticatedSession, getSession } from '~/features/authentication/index.server'
import {
  consumeDemoSignInToken,
  demoAccountFor,
  isDemoCongregation,
  isDemoModeEnabled,
} from '~/features/demo/index.server'
import * as m from '~/i18n/paraglide/messages'
import { findCongregation, resolveCongregationFromRequest } from '~/shared/domain/congregation.server'
import { getHostSettings } from '~/shared/domain/host-settings.server'
import { withScope } from '~/shared/infra/db.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/enter'

export const meta: Route.MetaFunction = () => [{ title: `${m.demo_expired_title()} - Unitae` }]

/**
 * The one-time link into a demo copy (docs/development/specs/demo-mode.md): signs the visitor in as the role the link
 * names, then opens the dashboard. A link that's used, expired, or for a copy that's gone shows why, with the way to
 * open a new demo.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isDemoModeEnabled()) throw new Response(null, { status: 404 })
  const host = await resolveCongregationFromRequest(request)
  if (!host) throw new Response(null, { status: 404 })

  const expired = data({ demoUrl: getHostSettings().demo?.demoUrl ?? null }, { status: 410 })
  const congregation = await findCongregation(host.id)
  const now = new Date()
  if (
    !congregation ||
    !isDemoCongregation(congregation) ||
    congregation.demoReadyAt == null ||
    (congregation.demoExpiresAt as Date) <= now
  ) {
    return expired
  }

  const token = new URL(request.url).searchParams.get('token') ?? ''
  const account = await withScope(congregation.id, async (db, congregationId) => {
    const role = await consumeDemoSignInToken(db, token, congregationId, now)
    return role ? demoAccountFor(db, congregationId, role) : null
  })
  if (account == null) return expired

  const session = await getSession(request.headers.get('Cookie'))
  await establishAuthenticatedSession(session, account)
  throw redirect('/', { headers: { 'Set-Cookie': await commitSession(session) } })
}

export default function DemoEnterPage({ loaderData }: Route.ComponentProps) {
  return (
    <AuthShell congregation={null} icon={Clock} title={m.demo_expired_title()} description={m.demo_expired_message()}>
      {loaderData.demoUrl && (
        <Button asChild className="w-full">
          <a href={loaderData.demoUrl}>{m.demo_expired_new()}</a>
        </Button>
      )}
    </AuthShell>
  )
}
