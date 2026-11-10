import { Clock } from 'lucide-react'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'

import { checkoutLink } from '~/shared/domain/billing-link.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT, AuthSignOut } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/trial-expired'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.trial_expired_title()} - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  // Signed, config-driven resubscription link: `checkoutLink` returns null when managed hosting is
  // not configured (self-hosting) — no billing UI is shown in that case.
  let upgradeUrl: string | null = null
  let congregation: string | null = null
  try {
    const session = await getSession(request.headers.get('Cookie'))
    const userId = Number(session.get('userId'))
    if (!Number.isNaN(userId) && userId > 0) {
      const user = await unscopedDb.userAccount.findUnique({
        where: { id: userId },
        select: { congregation: { select: { slug: true, name: true, displayName: true } } },
      })
      congregation = user?.congregation ? (user.congregation.displayName ?? user.congregation.name) : null
      const slug = user?.congregation?.slug
      if (slug) upgradeUrl = checkoutLink(slug)
    }
  } catch (error) {
    // Fall back to no link, but don't hide a real fault: the config-driven "no link" cases already
    // return null inside checkoutLink without throwing, so reaching here means the session or DB
    // actually failed.
    logger.warn('Could not resolve the upgrade link — showing the trial-expired page without it', {
      tag: 'trial-expired-loader',
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { congregation, upgradeUrl }
}

export default function TrialExpiredPage({ loaderData }: Route.ComponentProps) {
  const { congregation, upgradeUrl } = loaderData

  // Without a subscription link (a self-hosted instance), only signing out is left.
  return (
    <AuthShell
      congregation={congregation}
      eyebrow={congregation ?? undefined}
      icon={Clock}
      title={m.trial_expired_title()}
      description={m.trial_expired_message()}
    >
      {upgradeUrl && (
        <Button className={AUTH_SUBMIT} asChild>
          <a href={upgradeUrl}>{m.trial_expired_upgrade()}</a>
        </Button>
      )}
      <AuthSignOut>{m.trial_expired_logout()}</AuthSignOut>
    </AuthShell>
  )
}
