import { LogOut, RotateCcw, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/i18n/paraglide/messages'

import { checkoutLink } from '~/shared/domain/billing-link.server'
import { getHostSettings } from '~/shared/domain/host-settings.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/suspended'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Compte suspendu - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const hostSettings = getHostSettings()

  // Read suspended reason from DB instead of query param to prevent phishing.
  // Le slug sert à générer le lien de réabonnement signé (config-driven).
  let reason: string | null = null
  let reactivateUrl: string | null = null
  try {
    const session = await getSession(request.headers.get('Cookie'))
    const userId = Number(session.get('userId'))
    if (!Number.isNaN(userId) && userId > 0) {
      const user = await unscopedDb.userAccount.findUnique({
        where: { id: userId },
        select: { congregation: { select: { slug: true, suspendedReason: true } } },
      })
      reason = user?.congregation?.suspendedReason ?? null
      const slug = user?.congregation?.slug
      if (slug) reactivateUrl = checkoutLink(slug)
    }
  } catch {
    // Default to generic message if DB is unreachable
  }

  // Config-driven (présence de l'URL), pas MULTI_TENANT : un self-hébergeur n'a pas ces liens.
  return {
    reason,
    reactivateUrl,
    supportUrl: hostSettings.support?.url ?? null,
  }
}

export default function SuspendedPage({ loaderData }: Route.ComponentProps) {
  const { reason, reactivateUrl, supportUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-6 text-destructive" />
          </div>
          <CardTitle>{m.suspended_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{reason ? reason : m.suspended_message_default()}</p>
        </CardContent>
        <CardFooter className="flex-col gap-3">
          {reactivateUrl && (
            <Button asChild>
              <a href={reactivateUrl}>
                <RotateCcw className="size-4" />
                {m.suspended_reactivate()}
              </a>
            </Button>
          )}
          {supportUrl && (
            <Button variant={reactivateUrl ? 'outline' : 'default'} asChild>
              <a href={supportUrl}>{m.suspended_contact_support()}</a>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/logout">
              <LogOut className="size-4" />
              {m.suspended_logout()}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
