import { redirect } from 'react-router'

import type { Route } from './+types/list'

/** Sections are managed on « Gérer le tableau », as the groups of its list; old links land there. */
export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}
