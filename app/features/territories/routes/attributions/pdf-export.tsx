import { pdf } from '@react-pdf/renderer'
import { redirect } from 'react-router'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import { TerritoryAttributionDocument } from '~/features/territories/ui/TerritoryAttributionDocument'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_pdf_export_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.TerritoriesViewer)) {
    logger.warn(
      `Try to generate S-13 PDF report. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating S-13 PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const territories = await getTerritoriesExportData(db, congregationId, Number(params.year))
    const file = await pdf(
      <TerritoryAttributionDocument year={Number(params.year)} territories={territories} />,
    ).toBlob()

    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="S-13_F-${params.year}.zip"`,
      },
    })
  })
}
