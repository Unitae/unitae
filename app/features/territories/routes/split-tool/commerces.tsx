import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { countAvailableEntrances } from '~/features/territories/server/buildings.server'
import { computeNextTerritoryNumber } from '~/features/territories/server/compute-next-territory-number.server'
import { getCongregationCenter } from '~/features/territories/server/get-congregation-center.server'
import BuildingEntranceMapCreator from '~/features/territories/ui/BuildingEntranceMapCreator'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Permission } from '~/shared/types/permission'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/commerces'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.split_tool_commerces_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requirePermission(permissions, Permission.TerritoriesViewer)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(currentAccountContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive =
      (await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)) ?? false
    const [suggestedNumber, fallbackCenter, counts] = await Promise.all([
      computeNextTerritoryNumber(db, congregationId, TerritoryKindKey.Commerces),
      getCongregationCenter(db, congregationId),
      countAvailableEntrances(db, congregationId, TerritoryKindKey.Commerces, { phoneTypeActive }),
    ])
    return { apiKey, suggestedNumber, fallbackCenter, counts }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { apiKey, suggestedNumber, fallbackCenter, counts } = loaderData
  return (
    <BuildingEntranceMapCreator
      apiKey={apiKey}
      kind={TerritoryKindKey.Commerces}
      suggestedNumber={suggestedNumber}
      fallbackCenter={fallbackCenter ?? undefined}
      totalAvailable={counts.total}
      withoutCoordinates={counts.withoutCoordinates}
    />
  )
}
