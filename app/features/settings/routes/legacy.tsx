import { redirect } from 'react-router'
import { currentSettingsPath } from '~/features/settings/legacy-paths'
import type { Route } from './+types/legacy'

const TRAILING_QUERY = /\?$/

// The addresses Réglages had before its rebuild: each leads to where its page is now, its query kept.
export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const to = currentSettingsPath(url.pathname)
  // A target carrying its own query (?role=, or a bare ? that drops the old one) keeps it; any other keeps the old
  // address's.
  if (!to) throw redirect('/settings')
  throw redirect(to.includes('?') ? to.replace(TRAILING_QUERY, '') : `${to}${url.search}`)
}
