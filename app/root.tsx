import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import type { LinksFunction } from 'react-router'
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

import * as m from '~/paraglide/messages'
import { getLocale } from '~/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '~/shared/ui/card'
import { getErrorInfo } from '~/shared/ui/error-info'
import { IssueReportSection } from '~/shared/ui/IssueReportSection'

import './tailwind.css'

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&display=swap',
  },
]

export function loader() {
  return { locale: getLocale() }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root')
  const locale = data?.locale ?? 'fr'

  // Static inline script to prevent dark mode flash — no user input involved
  const darkModeScript =
    "(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()"

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-title" content="Conflu" />
        <link rel="icon" type="image/png" href="/icon.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <Meta />
        <Links />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static string constant, no user input
          dangerouslySetInnerHTML={{ __html: darkModeScript }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
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
