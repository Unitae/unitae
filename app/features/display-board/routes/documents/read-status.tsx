import { redirect } from 'react-router'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/read-status'

/** Who read a document now shows beside the list on « Gérer le tableau »; old links land there. */
export function loader({ params }: Route.LoaderArgs) {
  const documentId = requireParamId(params.documentId, '/board/documents')
  throw redirect(`/board/documents?lectures=pdf-${documentId}`)
}
