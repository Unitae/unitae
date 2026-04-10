import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { generateS13ExportExcel } from '~/features/territories/server/s13-export.server'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/excel-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Génération d'un export Excel s13 - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, can, db } = await authenticateAndAuthorize(request, [Role.TerritoriesViewer])
  const canViewTerritories = can(Role.TerritoriesViewer)

  if (!canViewTerritories) {
    logger.warn(
      `Try to generate S-13 XLSX report. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating S-13 XLSX report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })
  const data = await getTerritoriesExportData(db, Number(params.year))
  const file = await generateS13ExportExcel(data, params.year)

  return new Response(await file.xlsx.writeBuffer(), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.ms-excel',
      'Content-Disposition': `attachment; filename="S-13_F-${params.year}.xlsx"`,
    },
  })
}
