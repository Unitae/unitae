import { redirect } from 'react-router'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

// An attribution is changed in the side panel of the attributions page: the old address opens it there.
export function loader({ params }: Route.LoaderArgs) {
  const id = requireParamId(params.attributionId, '/territories/attributions')
  throw redirect(`/territories/attributions?open=${id}`)
}
