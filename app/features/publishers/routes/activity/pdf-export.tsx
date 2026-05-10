import { redirect } from 'react-router'
import {
  buildActivityPdfZip,
  getPublishersWithYearActivities,
} from '~/features/publishers/server/render-activity-pdf-zip.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_pdf_export_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canViewActivities = permissions.has(Permission.ActivityViewer)

  if (!canViewActivities) {
    logger.warn(
      `Try to generate publishers' activities PDF report. User ID: ${currentUser.id}. Does NOT have rights to access publishers' activity.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating publishers' activities PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const publishers = await withScopeFromContext(context, db =>
    getPublishersWithYearActivities(db, currentUser.congregationId, Number(params.year)),
  )

  const file = await buildActivityPdfZip(publishers)

  const today = new Date()
  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Activité-${params.year}_${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}.zip"`,
    },
  })
}
