import type { LinksFunction } from 'react-router'
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'

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
    href: 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap',
  },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
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
      </head>
      <body className="dark:bg-slate-950">
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
      <h1 className="m-5 font-bold text-4xl">Oops ! Quelque chose s'est mal passé...</h1>
      <p>
        <Link to="/" className="text-teal-600 underline">
          Revenir à l'accueil
        </Link>
      </p>
    </div>
  )
}

export default function App() {
  return <Outlet />
}
