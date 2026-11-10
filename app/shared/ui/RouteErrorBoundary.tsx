import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link, useLocation, useRouteError, useRouteLoaderData } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { ErrorDetails } from '~/shared/ui/ErrorDetails'
import { getErrorInfo } from '~/shared/ui/error-info'
import { type NavigationPermissions, navItemFor } from '~/shared/ui/navigation-config'
import { PageTopbar } from '~/shared/ui/PageTopbar'

/** The authenticated layout's route id: its loader holds what the viewer may open. */
const SHELL_ROUTE_ID = 'shell/_authenticated-layout'

/**
 * An error on a page inside the app, drawn where the page would have been: the sidebar stays, and besides home the
 * way back leads to the section the page belongs to. Server errors offer a retry and the technical details.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const { pathname } = useLocation()
  const shell = useRouteLoaderData<{ permissions: NavigationPermissions }>(SHELL_ROUTE_ID)
  const { icon: Icon, code, title, description, crumb, isServerError } = getErrorInfo(error)
  const section = shell ? navItemFor(pathname, shell.permissions) : null
  // One filled button: the retry when there is something to retry, else the most useful way back.
  const primary = isServerError ? 'retry' : section ? 'section' : 'home'

  return (
    <>
      <title>{`${title} - Unitae`}</title>
      <PageTopbar trail={[...(section ? [{ label: section.label(), to: section.to }] : []), { label: crumb }]} />
      <div className="flex justify-center py-10 md:py-16">
        <div className="flex w-full max-w-[25rem] animate-fade-in-up flex-col gap-4.5">
          <span className="grid size-10 place-content-center rounded-md border border-border bg-sidebar">
            <Icon aria-hidden="true" className="size-5 text-faint" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-faint text-sm tabular-nums">{code}</p>
            <h1 className="font-semibold text-2xl leading-tight tracking-tight">{title}</h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
          <div className="flex flex-wrap gap-2">
            {isServerError && (
              <Button onClick={() => window.location.reload()}>
                <RefreshCw aria-hidden="true" />
                {m.error_boundary_retry()}
              </Button>
            )}
            {section && (
              <Button variant={primary === 'section' ? 'default' : 'outline'} asChild>
                <Link to={section.to}>
                  <ArrowLeft aria-hidden="true" />
                  {section.label()}
                </Link>
              </Button>
            )}
            {pathname !== '/' && (
              <Button variant={primary === 'home' ? 'default' : 'ghost'} asChild>
                <Link to="/">{m.error_boundary_back_home()}</Link>
              </Button>
            )}
          </div>
          {isServerError && <ErrorDetails pathname={pathname} />}
        </div>
      </div>
    </>
  )
}
