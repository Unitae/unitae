import { redirect } from 'react-router'

import type { Route } from './+types/former-list'

/** Those who left are now a status of the publishers list; old links land there, search kept. */
export function loader({ request }: Route.LoaderArgs) {
  const query = new URL(request.url).searchParams.get('q')?.trim()
  const params = new URLSearchParams({ status: 'left', ...(query ? { q: query } : {}) })
  throw redirect(`/publishers?${params}`)
}
