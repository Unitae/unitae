import { SearchX } from 'lucide-react'
import * as m from '~/paraglide/messages'

import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'

import type { Route } from './+types/congregation-not-found'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Assemblée non trouvée - Unitae' }]
}

export default function CongregationNotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <SearchX className="size-6 text-muted-foreground" />
          </div>
          <CardTitle>{m.congregation_not_found_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{m.congregation_not_found_message()}</p>
        </CardContent>
      </Card>
    </div>
  )
}
