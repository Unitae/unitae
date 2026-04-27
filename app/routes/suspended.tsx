import { LogOut, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'
import { getSession } from '~/features/authentication/server/session.server'
import * as m from '~/paraglide/messages'

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
  const isMultiTenant = process.env.UNITAE_MULTI_TENANT === 'true'

  // Read suspended reason from DB instead of query param to prevent phishing
  let reason: string | null = null
  try {
    const session = await getSession(request.headers.get('Cookie'))
    const userId = Number(session.get('userId'))
    if (!Number.isNaN(userId) && userId > 0) {
      const user = await unscopedDb.user.findUnique({
        where: { id: userId },
        select: { congregation: { select: { suspendedReason: true } } },
      })
      reason = user?.congregation?.suspendedReason ?? null
    }
  } catch {
    // Default to generic message if DB is unreachable
  }

  return {
    reason,
    supportUrl: isMultiTenant ? (hostSettings.support?.url ?? null) : null,
  }
}

export default function SuspendedPage({ loaderData }: Route.ComponentProps) {
  const { reason, supportUrl } = loaderData

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
          {supportUrl && (
            <Button asChild>
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
