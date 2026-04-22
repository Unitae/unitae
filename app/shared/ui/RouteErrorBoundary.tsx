import { AlertTriangle, ArrowLeft, RefreshCw, SearchX, ShieldX } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'

function getErrorInfo(status: number) {
  if (status === 404) {
    return {
      icon: SearchX,
      title: m.error_boundary_not_found(),
      description: m.error_boundary_not_found_description(),
      showRetry: false,
    }
  }
  if (status === 403) {
    return {
      icon: ShieldX,
      title: m.error_boundary_forbidden(),
      description: m.error_boundary_forbidden_description(),
      showRetry: false,
    }
  }
  return {
    icon: AlertTriangle,
    title: m.error_boundary_server_error(),
    description: m.error_boundary_server_error_description(),
    showRetry: true,
  }
}

export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    const { icon: Icon, title, description, showRetry } = getErrorInfo(error.status)

    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md text-center">
          <CardHeader className="items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Icon className="size-6 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-muted-foreground/50">{error.status}</span>
            </div>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{description}</p>
          </CardContent>
          <CardFooter className="justify-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="size-4" />
                {m.error_boundary_back_home()}
              </Link>
            </Button>
            {showRetry && (
              <Button onClick={() => window.location.reload()}>
                <RefreshCw className="size-4" />
                {m.error_boundary_retry()}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-20">
      <Card className="max-w-md text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle>{m.error_boundary_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{m.error_boundary_server_error_description()}</p>
        </CardContent>
        <CardFooter className="justify-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              {m.error_boundary_back_home()}
            </Link>
          </Button>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            {m.error_boundary_retry()}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
