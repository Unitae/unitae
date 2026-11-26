import { redirect } from 'react-router'
import { permissionsContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
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

/** A tab left open on the old page across the change posts here: it lands on the panel, its change not kept. */
export function action({ params, context }: Route.ActionArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManageProgramTemplates)) throw redirect('/settings')
  const templateId = requireParamId(params.templateId, '/settings/templates')
  throw redirect(`/settings/templates?type=${templateId}`)
}
