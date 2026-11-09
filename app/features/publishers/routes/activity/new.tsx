import { redirect } from 'react-router'
import { reportPanelPath } from '~/features/publishers/model/group-activity-access'
import { reportQuerySchema } from '~/features/publishers/schemas/activity.schema'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'

import type { Route } from './+types/new'

// Reports are entered in a panel now. An old link to the new-report form opens that publisher's month in the panel:
// on the activity page, or on the group page for the group's overseer.
export function loader({ request, context }: Route.LoaderArgs) {
  const query = reportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) throw redirect('/publishers/activity')

  const permissions = context.get(permissionsContext)
  const member = context.get(currentAccountContext).member

  return withScopeFromContext(context, async (db, congregationId) => {
    const publisher = await db.member.findFirst({
      where: { id: query.data.publisherId, congregationId },
      select: { publisherGroupId: true },
    })
    const path =
      publisher &&
      reportPanelPath({
        permissions,
        leader: member && {
          responsibleForId: member.responsibleFor?.id ?? null,
          deputyForId: member.deputyFor?.id ?? null,
        },
        publisherGroupId: publisher.publisherGroupId,
        ...query.data,
      })
    throw redirect(path ?? '/')
  })
}
