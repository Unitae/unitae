import { redirect } from 'react-router'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// « Annuler l'attribution » is a dialog of the attribution's side panel: the old address opens the panel.
export function loader({ params }: Route.LoaderArgs) {
  const id = requireParamId(params.attributionId, '/territories/attributions')
  throw redirect(`/territories/attributions?open=${id}`)
}
