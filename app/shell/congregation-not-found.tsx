import { ExternalLink, SearchX } from 'lucide-react'
import * as m from '~/paraglide/messages'

import { getHostSettings } from '~/shared/domain/host-settings.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/congregation-not-found'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Assemblée non trouvée - Unitae' }]
}

export function loader() {
  const hostSettings = getHostSettings()
  const isMultiTenant = process.env.UNITAE_MULTI_TENANT === 'true'
  return {
    platformUrl: isMultiTenant ? (hostSettings.support?.url ?? null) : null,
  }
}

export default function CongregationNotFoundPage({ loaderData }: Route.ComponentProps) {
  const { platformUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <SearchX className="size-6 text-muted-foreground" />
          </div>
          <CardTitle>{m.congregation_not_found_title()}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground text-sm">{m.congregation_not_found_message()}</p>
          <p className="text-muted-foreground text-sm">{m.congregation_not_found_check_url()}</p>
        </CardContent>
        {platformUrl && (
          <CardFooter className="justify-center">
            <Button variant="outline" asChild>
              <a href={platformUrl}>
                <ExternalLink className="size-4" />
                {m.congregation_not_found_visit_platform()}
              </a>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
