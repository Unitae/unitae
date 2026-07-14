import { redirect } from 'react-router'
import {
  buildActivityPdfZip,
  getPublishersWithYearActivities,
} from '~/features/publishers/server/render-activity-pdf-zip.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_pdf_export_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewActivities = permissions.has(Permission.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities PDF report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  const searchParams = new URL(request.url).searchParams
  const year = Number(searchParams.get('year'))
  if (!Number.isFinite(year)) throw redirect('/publishers/activity')

  const groupIdParam = searchParams.get('groupId')
  const groupId = groupIdParam != null && groupIdParam !== '' ? Number(groupIdParam) : undefined
  const publisherIdsParam = searchParams.get('publisherIds')
  const publisherIds =
    publisherIdsParam != null && publisherIdsParam !== ''
      ? publisherIdsParam
          .split(',')
          .map(id => Number(id))
          .filter(id => Number.isFinite(id))
      : undefined

  logger.info(`Generating publishers' activities PDF report Year: ${year}. User ID: ${currentUser.id}.`, {
    currentUser,
    groupId,
    publisherCount: publisherIds?.length,
  })

  const publishers = await withScopeFromContext(context, db =>
    getPublishersWithYearActivities(db, currentUser.congregationId, year, { groupId, publisherIds }),
  )

  const file = await buildActivityPdfZip(publishers)

  const today = new Date()
  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Activité-${year}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.zip"`,
    },
  })
}
