import { Clock, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'

import { checkoutLink } from '~/shared/domain/billing-link.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/trial-expired'

export const meta: Route.MetaFunction = () => {
  return [{ title: "Période d'essai terminée - Unitae" }]
}

export async function loader({ request }: Route.LoaderArgs) {
  // Lien de réabonnement signé, config-driven : `checkoutLink` renvoie null si l'hébergement géré
  // n'est pas configuré (auto-hébergement) — aucune UI de facturation ne s'affiche alors.
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
  } catch {
    // Pas de lien si la session ou la base sont indisponibles.
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
