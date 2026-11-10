import { RefreshCw } from 'lucide-react'
import { Link, useLocation, useRouteError } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'
import { ErrorDetails } from '~/shared/ui/ErrorDetails'
import { getErrorInfo } from '~/shared/ui/error-info'

/**
 * An error the app could not frame — a page outside it, an unknown address, the app itself failing to load — on the
 * frame of the sign-in pages: the code above the title, the way home, and for a server error a retry and the details.
 */
export function OutsideAppError() {
  const error = useRouteError()
  const { pathname } = useLocation()
  const { icon, code, title, outsideDescription, isServerError } = getErrorInfo(error)

  return (
    <AuthShell congregation={null} icon={icon} eyebrow={code} title={title} description={outsideDescription}>
      <title>{`${title} - Unitae`}</title>
      {isServerError && (
        <Button className={AUTH_SUBMIT} onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" />
          {m.error_boundary_retry()}
        </Button>
      )}
      <Button variant={isServerError ? 'outline' : 'default'} className={AUTH_SUBMIT} asChild>
        <Link to="/">{m.error_boundary_back_home()}</Link>
      </Button>
      {isServerError && <ErrorDetails pathname={pathname} />}
    </AuthShell>
  )
}
