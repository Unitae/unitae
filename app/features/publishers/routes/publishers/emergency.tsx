import { redirect } from 'react-router'
import { getEmergencyInfoForMember } from '~/features/publishers/server/emergency.queries'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'

import { memberPanelPath } from './_member-back-path.server'
import type { Route } from './+types/emergency'

// The emergency information opens in a panel now, on the member's record or on their group's page. An old link opens it
// there; the panel's own route decides what the reader may see and change.
export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const { congregationId } = context.get(currentAccountContext)
  const memberId = requireParamId(params.publisherId, '/publishers')

  return withScopeFromContext(context, async db => {
    const member = await getEmergencyInfoForMember(db, memberId, congregationId)
    if (member == null) throw redirect('/publishers')
    throw redirect(
      memberPanelPath(request, permissions, { id: memberId, publisherGroupId: member.publisherGroupId }, 'emergency'),
    )
  })
}
