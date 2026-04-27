import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import * as m from '~/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { getErrorInfo } from '~/shared/ui/error-info'
import { IssueReportSection } from '~/shared/ui/IssueReportSection'

export function RouteErrorBoundary() {
  const error = useRouteError()
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'

  if (isRouteErrorResponse(error)) {
    const { icon: Icon, title, description, showRetry, showReport } = getErrorInfo(error.status)

    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md text-center">
          <CardHeader className="items-center justify-items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Icon className="size-6 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold font-display text-4xl text-muted-foreground/50">{error.status}</span>
            </div>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{description}</p>
            {showReport && <IssueReportSection pathname={pathname} />}
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
        <CardHeader className="items-center justify-items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <CardTitle>{m.error_boundary_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{m.error_boundary_server_error_description()}</p>
          <IssueReportSection pathname={pathname} />
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
