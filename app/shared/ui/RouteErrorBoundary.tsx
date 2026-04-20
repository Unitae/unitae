import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import * as m from '~/paraglide/messages'

export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <h1 className="font-bold font-display text-4xl">{error.status}</h1>
        <p className="text-muted-foreground">{error.statusText || m.error_boundary_title()}</p>
        <Link to="/" className="text-primary underline">
          {m.error_boundary_back_home()}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <h1 className="font-bold font-display text-4xl">{m.error_boundary_title()}</h1>
      <Link to="/" className="text-primary underline">
        {m.error_boundary_back_home()}
      </Link>
    </div>
  )
}
