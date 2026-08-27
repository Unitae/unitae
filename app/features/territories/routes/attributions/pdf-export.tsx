import { redirect } from 'react-router'
import { getTerritoriesExportData } from '~/features/territories/server/territories-export-data.server'
import { TerritoryAttributionDocument } from '~/features/territories/ui/TerritoryAttributionDocument'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { renderPdfResponse } from '~/shared/infra/pdf.server'
import { Permission } from '~/shared/types/permission'

import type { Route } from './+types/pdf-export'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.attributions_pdf_export_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.CanViewTerritoryAttributions)) {
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

    return renderPdfResponse(
      <TerritoryAttributionDocument year={Number(params.year)} territories={territories} />,
      `S-13_F-${params.year}.pdf`,
    )
  })
}
