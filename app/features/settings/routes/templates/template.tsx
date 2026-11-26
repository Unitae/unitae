import { redirect } from 'react-router'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/template'

/**
 * A meeting type's own page until 6b-2b: it opens in the side panel of « Types d’évènement » now, so bookmarks and
 * links in old e-mails land there.
 */
export function loader({ params }: Route.LoaderArgs) {
  const templateId = requireParamId(params.templateId, '/settings/templates')
  throw redirect(`/settings/templates?type=${templateId}`)
}
