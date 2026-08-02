import { redirect } from 'react-router'
import { getPublishersWithEmergencyInfo } from '~/features/publishers/server/emergency.queries'
import { EmergencyRosterDocument } from '~/features/publishers/ui/EmergencyRosterDocument'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/emergency-roster'

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  // Congregation-wide roster is global-only: a group responsible uses the
  // per-group roster instead.
  const canView = permissions.has(Permission.EmergencyInfoViewer) || permissions.has(Permission.EmergencyInfoManager)
  if (!canView) throw redirect('/')

  return withScopeFromContext(context, async db => {
    const publishers = await getPublishersWithEmergencyInfo(db, currentUser.congregationId)
    return renderPdfResponse(
      <EmergencyRosterDocument title={m.publishers_emergency_roster_all_groups()} publishers={publishers} />,
      'urgences.pdf',
    )
  })
}
