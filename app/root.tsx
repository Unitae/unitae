import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { requestLocale } from '~/shared/middleware/locale.server'
import { originCheck } from '~/shared/middleware/origin-check.server'
import { nonceContext, securityHeaders } from '~/shared/middleware/security-headers.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { getErrorInfo } from '~/shared/ui/error-info'
import { IssueReportSection } from '~/shared/ui/IssueReportSection'

import type { Route } from './+types/root'
import './tailwind.css'

// securityHeaders stays outer so the 403 originCheck may return is also hardened. requestLocale comes
// after originCheck: a request originCheck rejects never pays for the locale lookup.
export const middleware: Route.MiddlewareFunction[] = [securityHeaders(), originCheck(), requestLocale()]

export function loader({ context }: Route.LoaderArgs) {
  return { locale: getLocale(), nonce: context.get(nonceContext) }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  const locale = data?.locale ?? 'fr'
  const nonce = data?.nonce

  // Static inline script to prevent dark mode flash — no user input involved
  const darkModeScript =
    "(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()"

  // Zod tries `new Function('')` the first time an object schema is defined, to see whether it may
  // compile faster parsers. The CSP has no 'unsafe-eval', so that probe sends a violation report on
  // every page (Zod catches the error and falls back). Zod reads this global when it loads, which is
  // after this script and before any route module defines a schema. The server keeps the compiled parsers.
  const zodConfigScript =
    'globalThis.__zod_globalConfig=Object.assign(globalThis.__zod_globalConfig||{},{jitless:true})'

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        {/* viewport-fit=cover: without it, iOS reports env(safe-area-inset-*) as 0
            and every safe-area padding (tab bar, sheets, docked form bars) is inert. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-title" content="Unitae" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f9fafb" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d0e11" />
        <link rel="icon" type="image/png" href="/icon.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <Meta />
        <Links />
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static string constant, no user input
          dangerouslySetInnerHTML={{ __html: darkModeScript }}
        />
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static string constant, no user input
          dangerouslySetInnerHTML={{ __html: zodConfigScript }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'

  if (isRouteErrorResponse(error)) {
    const { icon: Icon, title, description, showRetry, showReport } = getErrorInfo(error.status)

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
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
    <div className="flex min-h-screen items-center justify-center px-4">
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

export default function App() {
  return <Outlet />
}
