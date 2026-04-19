import { redirect } from 'react-router'

import { Role } from '~/shared/types/role'
import { generatePublishersYearlyActivityXlsx } from '~/features/publishers/server/generate-publishers-yearly-activity-xlsx.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/excel-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_excel_export_meta_title() }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ActivityViewer])
  const canViewActivities = can(Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities XLSX report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities XLSX report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  return withScope(congregationId, async db => {
    const file = await generatePublishersYearlyActivityXlsx(db, congregationId, Number(params.year))

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename="Activité-Proclamateurs-${params.year}.xlsx"`,
      },
    })
  })
}
