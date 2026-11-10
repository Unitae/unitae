import * as m from '~/i18n/paraglide/messages'

import { getHostSettings } from '~/shared/domain/host-settings.server'
import { AuthShell } from '~/shared/ui/AuthShell'
import { AUTH_SUBMIT } from '~/shared/ui/auth-parts'
import { Button } from '~/shared/ui/button'

import type { Route } from './+types/congregation-not-found'

export const meta: Route.MetaFunction = () => {
  return [{ title: `${m.congregation_not_found_title()} - Unitae` }]
}

export function loader({ request }: Route.LoaderArgs) {
  const { branding } = getHostSettings()
  // Only where the instance names a site of its own: an instance that sets nothing sends nobody anywhere else.
  const home = branding?.homeUrl
    ? { url: branding.homeUrl, name: branding.platformName ?? new URL(branding.homeUrl).hostname }
    : null
  // The redirect here keeps the host, so the address the visitor typed is the one this request came to.
  return { host: new URL(request.url).hostname, home }
}

export default function CongregationNotFoundPage({ loaderData }: Route.ComponentProps) {
  const { host, home } = loaderData

  return (
    <AuthShell
      congregation={null}
      title={m.congregation_not_found_title()}
      description={
        <>
          <strong className="font-medium text-foreground">{host}</strong> {m.congregation_not_found_message()}{' '}
          {home ? m.congregation_not_found_check() : m.congregation_not_found_check_sender()}
        </>
      }
    >
      {home && (
        <Button variant="outline" className={AUTH_SUBMIT} asChild>
          <a href={home.url}>{m.congregation_not_found_go_to({ name: home.name })}</a>
        </Button>
      )}
    </AuthShell>
  )
}
