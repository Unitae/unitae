import { redirect } from 'react-router'

import type { Route } from './+types/new'

const PICKER = '/territories/attributions/new/available-territories'

// A territory is attributed from « Attribuer un territoire », in its side panel: the old address opens it there.
export function loader({ request }: Route.LoaderArgs) {
  const territory = Number(new URL(request.url).searchParams.get('territory'))
  throw redirect(Number.isInteger(territory) && territory > 0 ? `${PICKER}?open=${territory}` : PICKER)
}
