import { pdf } from '@react-pdf/renderer'
import { redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import { TerritoryAttributionDocument } from '~/features/territories/ui/TerritoryAttributionDocument'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Génération d'un export PDF s13 - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)

  if (!canViewTerritories) {
    logger.warn(
      `Try to generate S-13 PDF report. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating S-13 PDF report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const territories = await getTerritoriesExportData(Number(params.year))
  const file = await pdf(<TerritoryAttributionDocument year={Number(params.year)} territories={territories} />).toBlob()

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="S-13_F-${params.year}.zip"`,
    },
  })
}
