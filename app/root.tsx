import type { LinksFunction } from 'react-router'
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from 'react-router'

import * as m from '~/paraglide/messages'
import { getLocale } from '~/paraglide/runtime'

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

  return (
    <html lang={data?.locale ?? 'fr'} suppressHydrationWarning>
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
          // biome-ignore lint/security/noDangerouslySetInnerHtml: inline script to prevent dark mode flash
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
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
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1 className="m-5 font-bold font-display text-4xl">{m.error_boundary_title()}</h1>
      <p>
        <Link to="/" className="text-primary underline">
          {m.error_boundary_back_home()}
        </Link>
      </p>
    </div>
  )
}

export default function App() {
  return <Outlet />
}
