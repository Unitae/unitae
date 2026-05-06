import { redirect } from 'react-router'
import {
  buildPublishersYearlyActivityXlsx,
  getPublishersYearlyActivities,
} from '~/features/publishers/server/generate-publishers-yearly-activity-xlsx.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/excel-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_excel_export_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewActivities = permissions.has(Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities XLSX report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities XLSX report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const months = await withScopeFromContext(context, db =>
    getPublishersYearlyActivities(db, currentUser.congregationId, Number(params.year)),
  )

  const file = await buildPublishersYearlyActivityXlsx(months)

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="Activité-Proclamateurs-${params.year}.xlsx"`,
    },
  })
}
