import { redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { generatePublishersYearlyActivityXlsx } from '~/features/publishers/server/generate-publishers-yearly-activity-xlsx.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/excel-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Génération d'un export Excel - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewActivities = await verifyRole(request, Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities XLSX report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities XLSX report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })
  const file = await generatePublishersYearlyActivityXlsx(Number(params.year))

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="Activité-Proclamateurs-${params.year}.xlsx"`,
    },
  })
}
