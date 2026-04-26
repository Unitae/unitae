import { AlertTriangle, ArrowLeft, ExternalLink, RefreshCw, SearchX, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { isRouteErrorResponse, Link, useLocation, useRouteError } from 'react-router'

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
      showReport: false,
    }
  }
  if (status === 403) {
    return {
      icon: ShieldX,
      title: m.error_boundary_forbidden(),
      description: m.error_boundary_forbidden_description(),
      showRetry: false,
      showReport: false,
    }
  }
  return {
    icon: AlertTriangle,
    title: m.error_boundary_server_error(),
    description: m.error_boundary_server_error_description(),
    showRetry: true,
    showReport: true,
  }
}

function IssueReportSection({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  const timestamp = new Date().toISOString()
  const issueTitle = encodeURIComponent(`Bug: Unexpected error on ${pathname}`)
  const issueBody = encodeURIComponent(
    `## Description\n\nAn unexpected error occurred.\n\n## Technical details\n\n- **Route:** ${pathname}\n- **Timestamp:** ${timestamp}\n- **Browser:** ${navigator.userAgent}\n\n## Steps to reproduce\n\n1. ...\n`,
  )
  const issueUrl = `https://github.com/Unitae/unitae/issues/new?title=${issueTitle}&body=${issueBody}&labels=bug`

  return (
    <div className="mt-4 w-full rounded-lg border p-3 text-left text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between">
        <span className="font-medium text-muted-foreground">{m.error_technical_details()}</span>
        <span className="text-muted-foreground">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="rounded bg-muted p-2 font-mono text-muted-foreground">
            <div>Route: {pathname}</div>
            <div>Time: {timestamp}</div>
          </div>
          <p className="text-muted-foreground">{m.error_report_issue_description()}</p>
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            {m.error_report_issue()}
            <ExternalLink className="size-3" />
          </a>
        </div>
      )}
    </div>
  )
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  let pathname = '/'
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: useLocation may fail in error boundary if router context is broken
    pathname = useLocation().pathname
  } catch {
    // useLocation can fail if the router context is broken
  }

  if (isRouteErrorResponse(error)) {
    const { icon: Icon, title, description, showRetry, showReport } = getErrorInfo(error.status)

    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md text-center">
          <CardHeader className="items-center gap-3">
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
        <CardHeader className="items-center gap-3">
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
