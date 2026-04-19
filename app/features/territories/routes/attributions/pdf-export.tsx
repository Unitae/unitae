import { pdf } from '@react-pdf/renderer'
import { redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import { TerritoryAttributionDocument } from '~/features/territories/ui/TerritoryAttributionDocument'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_pdf_export_meta_title() }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.TerritoriesViewer])
  const canViewTerritories = can(Role.TerritoriesViewer)

  if (!canViewTerritories) {
    logger.warn(
      `Try to generate S-13 PDF report. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating S-13 PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  return withScope(congregationId, async db => {
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
