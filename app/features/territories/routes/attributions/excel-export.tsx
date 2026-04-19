import { redirect } from 'react-router'
import { generateS13ExportExcel } from '~/features/territories/server/s13-export.server'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import * as m from '~/paraglide/messages'
import logger from '~/shared/infra/logger.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/excel-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_excel_export_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.TerritoriesViewer)) {
    logger.warn(
      `Try to generate S-13 XLSX report. User ID: ${currentUser.id}. Does NOT have rights to access territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Generating S-13 XLSX report Year: ${params.year}. User ID: ${currentUser.id}.`, {
    currentUser,
  })

  const { congregationId } = currentUser

  return withScopeFromContext(context, async db => {
    const exportData = await getTerritoriesExportData(db, congregationId, Number(params.year))
    const file = await generateS13ExportExcel(exportData, params.year)

    return new Response(await file.xlsx.writeBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.ms-excel',
        'Content-Disposition': `attachment; filename="S-13_F-${params.year}.xlsx"`,
      },
    })
  })
}
