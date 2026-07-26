import { Clock, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'

import { checkoutLink } from '~/shared/domain/billing-link.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/trial-expired'

export const meta: Route.MetaFunction = () => {
  return [{ title: "Période d'essai terminée - Unitae" }]
}

export async function loader({ request }: Route.LoaderArgs) {
  // Signed, config-driven resubscription link: `checkoutLink` returns null when managed hosting is
  // not configured (self-hosting) — no billing UI is shown in that case.
  let upgradeUrl: string | null = null
  try {
    const session = await getSession(request.headers.get('Cookie'))
    const userId = Number(session.get('userId'))
    if (!Number.isNaN(userId) && userId > 0) {
      const user = await unscopedDb.userAccount.findUnique({
        where: { id: userId },
        select: { congregation: { select: { slug: true } } },
      })
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

  return { upgradeUrl }
}

export default function TrialExpiredPage({ loaderData }: Route.ComponentProps) {
  const { upgradeUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Clock className="size-6 text-muted-foreground" />
          </div>
          <CardTitle>{m.trial_expired_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{m.trial_expired_message()}</p>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          {upgradeUrl && (
            <Button asChild>
              <a href={upgradeUrl}>{m.trial_expired_upgrade()}</a>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/logout">
              <LogOut className="size-4" />
              {m.trial_expired_logout()}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
