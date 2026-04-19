import { redirect } from 'react-router'

import { Role } from '~/shared/types/role'
import { renderActivityPdfZip } from '~/features/publishers/server/render-activity-pdf-zip.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_pdf_export_meta_title() }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.ActivityViewer])
  const canViewActivities = can(Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities PDF report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  return withScope(congregationId, async db => {
    const today = new Date()
    const file = await renderActivityPdfZip(db, congregationId, Number(params.year))

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Activité-${params.year}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.zip"`,
      },
    })
  })
}
