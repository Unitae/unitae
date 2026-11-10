import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router'

import { getLocale } from '~/i18n/paraglide/runtime'
import { requestLocale } from '~/shared/middleware/locale.server'
import { originCheck } from '~/shared/middleware/origin-check.server'
import { nonceContext, securityHeaders } from '~/shared/middleware/security-headers.server'
import { OutsideAppError } from '~/shared/ui/OutsideAppError'

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

// Errors under the authenticated layout are drawn inside the app by its own boundary; this one takes the rest.
export function ErrorBoundary() {
  return <OutsideAppError />
}

export default function App() {
  return <Outlet />
}
