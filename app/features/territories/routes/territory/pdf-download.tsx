import { redirect } from 'react-router'
import { findTerritoryWithHistory } from '~/features/territories/server/attributions.server'
import { aggregateEntrance } from '~/features/territories/server/buildings.server'
import { listCardOverlays } from '~/features/territories/server/card-overlays.server'
import { getPerimeterPaths } from '~/features/territories/server/perimeter.server'
import { showPhoneOnTerritoryCard } from '~/features/territories/server/territory-pdf.server'
import { TerritoryDocument } from '~/features/territories/ui/TerritoryDocument'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { renderPdfResponse, sanitizeFilename } from '~/shared/infra/pdf.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { getOptionalEnv } from '~/shared/utils/env.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/pdf-download'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const territoryId = requireParamId(params.territoryId, '/territories')

  return withScopeFromContext(context, async db => {
    const territory = await findTerritoryWithHistory(db, territoryId, currentUser.congregationId)

    if (territory == null) {
      throw redirect('/territories', { status: 404 })
    }

    const canViewTerritories = permissions.has(Role.TerritoriesViewer)
    const isCurrentlyAttributed = territory.attributions.some(
      a => a.endDate == null && a.publisherId === currentUser.id,
    )

    if (!canViewTerritories && !isCurrentlyAttributed) {
      throw new ForbiddenError()
    }

    const phoneTypeActive = await getBoolSetting(
      db,
      TerritorySettingKey.TerritoryTypePhoneActive,
      currentUser.congregationId,
    )
    const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
    const mapId = getOptionalEnv('GOOGLE_MAPS_MAP_ID')
    const overlays = await listCardOverlays(db)
    const perimeter = await getPerimeterPaths(db)

    const entrances = territory.entrances.map(aggregateEntrance)
    const currentAttribution = territory.attributions.find(a => a.endDate == null)
    const owner = currentAttribution
      ? `${currentAttribution.publisher.firstname} ${currentAttribution.publisher.lastname?.toUpperCase().at(0)}.`
      : undefined
    const ownerFirstname = sanitizeFilename(currentAttribution?.publisher.firstname?.toLowerCase() ?? '')
    const filename = `territoire-${sanitizeFilename(territory.number)}${ownerFirstname.length > 0 ? `__${ownerFirstname}` : ''}.pdf`

    return renderPdfResponse(
      <TerritoryDocument
        name={territory.number}
        type={territory.type}
        entrances={entrances}
        googleMapKey={apiKey}
        googleMapId={mapId}
        overlays={overlays}
        perimeter={perimeter}
        showPhone={showPhoneOnTerritoryCard(phoneTypeActive ?? false)}
        owner={owner}
        restitutionDate={currentAttribution?.lateDate ?? undefined}
        attributionType={currentAttribution?.type}
      />,
      filename,
    )
  })
}
