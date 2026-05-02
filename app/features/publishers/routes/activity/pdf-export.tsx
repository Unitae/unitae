import { redirect } from 'react-router'
import { renderActivityPdfZip } from '~/features/publishers/server/render-activity-pdf-zip.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_pdf_export_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewActivities = permissions.has(Role.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities PDF report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  return withScopeFromContext(context, async db => {
    const today = new Date()
    const file = await renderActivityPdfZip(db, currentUser.congregationId, Number(params.year))

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="Activité-${params.year}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.zip"`,
      },
    })
  })
}
