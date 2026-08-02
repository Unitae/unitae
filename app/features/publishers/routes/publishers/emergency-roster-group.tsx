import { redirect } from 'react-router'
import { canViewEmergencyInfo } from '~/features/publishers/model/emergency-access'
import { getPublishersWithEmergencyInfo } from '~/features/publishers/server/emergency.queries'
import { EmergencyRosterDocument } from '~/features/publishers/ui/EmergencyRosterDocument'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/emergency-roster-group'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const groupId = requireParamId(params.groupId, '/publishers')

  return withScopeFromContext(context, async db => {
    const group = await db.publisherGroup.findFirst({
      where: { id: groupId, congregationId: currentUser.congregationId },
      select: { id: true, name: true },
    })
    if (!group) throw redirect('/publishers')

    // Global viewer/manager (any group) OR responsible/deputy of this group.
    const canView = canViewEmergencyInfo({
      hasViewer: permissions.has(Permission.EmergencyInfoViewer),
      hasManager: permissions.has(Permission.EmergencyInfoManager),
      myResponsibleGroupId: currentUser.member?.responsibleFor?.id ?? null,
      myDeputyGroupId: currentUser.member?.deputyFor?.id ?? null,
      targetGroupId: group.id,
    })
    if (!canView) throw redirect('/')

    const publishers = await getPublishersWithEmergencyInfo(db, currentUser.congregationId, { groupId })
    return renderPdfResponse(
      <EmergencyRosterDocument title={formatGroupName(group.name)} publishers={publishers} />,
      `urgences-${sanitizeFilename(group.name)}.pdf`,
    )
  })
}
