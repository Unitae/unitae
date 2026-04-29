import { Clock, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/paraglide/messages'

import { getHostSettings } from '~/shared/domain/host-settings.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/trial-expired'

export const meta: Route.MetaFunction = () => {
  return [{ title: "Période d'essai terminée - Unitae" }]
}

export function loader() {
  const hostSettings = getHostSettings()
  const isMultiTenant = process.env.UNITAE_MULTI_TENANT === 'true'

  return {
    upgradeUrl: isMultiTenant ? (hostSettings.billing?.upgradeUrl ?? null) : null,
  }
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
