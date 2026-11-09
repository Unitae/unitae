import { redirect } from 'react-router'
import { reportPanelPath } from '~/features/publishers/model/group-activity-access'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

// Reports are changed in a panel now. An old link to a report opens its month in the panel: on the activity page, or
// on the group page for the group's overseer. The panel's route decides whether the reader may change it.
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const member = context.get(currentAccountContext).member

  return withScopeFromContext(context, async (db, congregationId) => {
    const report = await db.publisherActivity.findFirst({
      where: { id: requireParamId(params.activityId, '/publishers/activity'), congregationId },
      select: { publisherId: true, month: true, year: true, publisher: { select: { publisherGroupId: true } } },
    })
    const path =
      report &&
      reportPanelPath({
        permissions,
        leader: member && {
          responsibleForId: member.responsibleFor?.id ?? null,
          deputyForId: member.deputyFor?.id ?? null,
        },
        publisherGroupId: report.publisher.publisherGroupId,
        publisherId: report.publisherId,
        month: report.month,
        year: report.year,
      })
    throw redirect(path ?? '/')
  })
}
