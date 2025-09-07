import { redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { renderActivityPdfZip } from '~/features/publishers/server/render-activity-pdf-zip.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Génération d'un export PDF - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewActivities = await verifyRole(request, Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities PDF report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const today = new Date()
  const file = await renderActivityPdfZip(Number(params.year))

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Activité-${params.year}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.zip"`,
    },
  })
}
