import { Ban } from 'lucide-react'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'

import { checkoutLink } from '~/shared/domain/billing-link.server'
import { getHostSettings } from '~/shared/domain/host-settings.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthSignOut } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/suspended'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.suspended_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const hostSettings = getHostSettings()

  // Read suspended reason from DB instead of query param to prevent phishing.
  // The slug is used to build the signed reactivation link (config-driven).
  let reason: string | null = null
  let reactivateUrl: string | null = null
  let congregation: string | null = null
  try {
    const session = await getSession(request.headers.get('Cookie'))
    const userId = Number(session.get('userId'))
    if (!Number.isNaN(userId) && userId > 0) {
      const user = await unscopedDb.userAccount.findUnique({
        where: { id: userId },
        select: { congregation: { select: { slug: true, suspendedReason: true, name: true, displayName: true } } },
      })
      reason = user?.congregation?.suspendedReason ?? null
      congregation = user?.congregation ? (user.congregation.displayName ?? user.congregation.name) : null
      const slug = user?.congregation?.slug
      if (slug) reactivateUrl = checkoutLink(slug)
    }
  } catch (error) {
    // Fall back to the generic message, but don't hide a real fault (DB down, session decode
    // failure after a secret rotation, etc.) — the config-driven "no link" cases already return
    // null inside checkoutLink without throwing, so reaching here means something actually broke.
    logger.warn('Could not resolve the reactivation link — showing the generic suspended page', {
      tag: 'suspended-loader',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Config-driven (presence of the URL), not MULTI_TENANT: a self-hoster has no such links.
  return {
    congregation,
    reason,
    reactivateUrl,
    supportUrl: hostSettings.support?.url ?? null,
  }
}

export default function SuspendedPage({ loaderData }: Route.ComponentProps) {
  const { congregation, reason, reactivateUrl, supportUrl } = loaderData

  return (
    <AuthShell
      congregation={congregation}
      eyebrow={congregation ?? undefined}
      icon={Ban}
      title={m.suspended_title()}
      description={reason ?? m.suspended_message_default()}
    >
      {reactivateUrl && (
        <Button className={AUTH_SUBMIT} asChild>
          <a href={reactivateUrl}>{m.suspended_reactivate()}</a>
        </Button>
      )}
      {supportUrl && (
        <Button variant={reactivateUrl ? 'outline' : 'default'} className={AUTH_SUBMIT} asChild>
          <a href={supportUrl}>{m.suspended_contact_support()}</a>
        </Button>
      )}
      <AuthSignOut>{m.suspended_logout()}</AuthSignOut>
    </AuthShell>
  )
}
