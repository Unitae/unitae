import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteCampaign } from '~/features/territories/server/campaign.aggregate'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/delete'

// Deleting is a dialog on the campaign's page now; an old link to this page lands there.
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)
  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')
  throw redirect(`/territories/attributions/campaigns/${id}`)
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManageTerritoryCampaigns)

  const { id: actorId } = context.get(currentAccountContext)
  const id = requireParamId(params.campaignId, '/territories/attributions/campaigns')

  return withScopeFromContext(context, async (db, congregationId) => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const campaign = await deleteCampaign(db, id, congregationId, actorId)
      session.flash('success', m.campaigns_delete_flash_success({ name: campaign.name }))
      return redirect('/territories/attributions/campaigns', {
        headers: { 'Set-Cookie': await commitSession(session) },
      })
    } catch (err) {
      if (err instanceof ConflictError && err.message === 'campaign_active') {
        session.flash('error', m.campaigns_delete_active_error())
        return redirect(`/territories/attributions/campaigns/${id}`, {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      if (err instanceof ConflictError && err.message === 'campaign_has_attributions') {
        session.flash('error', m.campaigns_delete_has_attributions_error())
        return redirect(`/territories/attributions/campaigns/${id}`, {
          headers: { 'Set-Cookie': await commitSession(session) },
        })
      }
      throw err
    }
  })
}
