import { redirect } from 'react-router'
import { currentSettingsPath } from '~/features/settings/legacy-paths'
import type { Route } from './+types/legacy'

// The addresses Réglages had before its rebuild: each leads to where its page is now, its query kept.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const to = currentSettingsPath(url.pathname)
  throw redirect(to ? `${to}${url.search}` : '/settings')
}
