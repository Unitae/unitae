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
import logger from '~/shared/infra/logger.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/enter'

export const meta: Route.MetaFunction = () => [{ title: `${m.demo_expired_title()} - Unitae` }]

/**
 * The one-time link into a demo copy: signs the visitor in as the role the link
 * names, then opens the dashboard. A link that's used or expired, or for a copy that's expired or already deleted,
 * shows the expired page with the way to open a new demo. Each refusal logs its reason, never the token.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (!isDemoModeEnabled()) throw new Response(null, { status: 404 })

  const expired = (reason: string, congregationId?: number) => {
    logger.warn('Demo link refused', { reason, congregationId })
    return data({ demoUrl: getHostSettings().demo?.demoUrl ?? null }, { status: 410 })
  }

  let host: { id: number; slug: string } | null
  try {
    host = await resolveCongregationFromRequest(request)
  } catch (error) {
    // A copy the control plane already deleted no longer resolves: its link has expired, it isn't a wrong address.
    if (error instanceof Response) return expired('deleted')
    throw error
  }
  if (!host) throw new Response(null, { status: 404 })

  const congregation = await findCongregation(host.id)
  const now = new Date()
  if (!congregation || !isDemoCongregation(congregation)) return expired('not-a-copy', host.id)
  if (congregation.demoReadyAt == null) return expired('not-ready', host.id)
  if ((congregation.demoExpiresAt as Date) <= now) return expired('copy-expired', host.id)

  const token = new URL(request.url).searchParams.get('token') ?? ''
  const result = await withScope(congregation.id, async (db, congregationId) => {
    const role = await consumeDemoSignInToken(db, token, congregationId, now)
    if (!role) return { ok: false, reason: 'token' } as const
    const account = await demoAccountFor(db, congregationId, role)
    return account == null ? ({ ok: false, reason: 'no-login' } as const) : ({ ok: true, account } as const)
  })
  if (!result.ok) {
    // A valid token with no login for its role is the seed's fault, not the visitor's.
    if (result.reason === 'no-login') logger.error('Demo copy has no login for a role', { congregationId: host.id })
    return expired(result.reason, host.id)
  }

  const session = await getSession(request.headers.get('Cookie'))
  await establishAuthenticatedSession(session, result.account)
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
