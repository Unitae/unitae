import { redirect } from 'react-router'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/edit'

// The old « Modifier un orateur » page: the speaker now opens in the list's panel, on its form.
export function loader({ params }: Route.LoaderArgs) {
  const id = requireParamId(params.externalSpeakerId, '/programs/external-speakers')
  return redirect(`/programs/external-speakers?speaker=${id}&edit`)
}
