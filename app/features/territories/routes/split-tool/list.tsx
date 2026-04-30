import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { EntranceKind } from '~/features/territories/model/entrance-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeFilters } from '~/features/territories/server/building-filters.server'
import { findEntrancesPaginated } from '~/features/territories/server/buildings.server'
import BuildingEntranceList from '~/features/territories/ui/BuildingEntranceList'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import Pagination from '~/shared/ui/Pagination'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.split_tool_classical_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  requireRole(permissions, Role.TerritoriesViewer)

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)

    const url = new URL(request.url)
    const filters = computeFilters(url.searchParams)
    const selectors: Prisma.BuildingEntranceWhereInput = {
      kind: EntranceKind.Residential,
      buildings: {
        some: {
          ...filters,
          active: true,
          NOT: { prospectionDate: null },
        },
      },
      OR: [
        { access: 1 }, // interphone
        { access: 2 }, // sonnette
        phoneTypeActive ? { access: 4, isOpenEarly: true } : { access: 4 }, // code ouvert le matin
      ],
      territories: { none: { type: TerritoryKind.Classical } },
    }

    const { entrances, pagination } = await findEntrancesPaginated(db, selectors, url, congregationId)

    return {
      entrances,
      pagination,
      apiKey,
    }
  })
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { pagination, apiKey, entrances } = loaderData
  const [selectedEntranceIds, setSelectedEntranceIds] = useState<number[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional dependency list
  useEffect(() => {
    setSelectedEntranceIds([])
  }, [entrances.map(el => el.id).join()])

  if (entrances.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>{m.split_tool_empty_classical()}</p>
        <p>{m.split_tool_empty_classical_hint()}</p>
      </div>
    )
  }

  const selectedEntrances = entrances.filter(entrance => selectedEntranceIds.includes(entrance.id))

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm italic shadow-sm">
        {selectedEntranceIds.length > 0 ? (
          <>
            <p>
              {m.split_tool_creating_with_homes({
                count: entrances.reduce((countForTerritory, currentEntrance) => {
                  if (selectedEntranceIds.includes(currentEntrance.id)) {
                    return countForTerritory + ((currentEntrance.homes ?? 0) || (currentEntrance.phones ?? 0))
                  }

                  return countForTerritory
                }, 0),
              })}
            </p>
            <Form action="/territories/buildings/split-territories/create" method="post">
              <input type="hidden" name="type" value={TerritoryKind.Classical} />
              <input type="hidden" name="entranceIds" value={selectedEntranceIds.join(',')} />
              <Button type="submit" size="sm">
                {m.split_tool_create_button()}
              </Button>
            </Form>
          </>
        ) : (
          <p className="text-muted-foreground">{m.split_tool_no_selection()}</p>
        )}
      </div>

      <div className="flex min-h-[500px] grow gap-7">
        <BuildingEntranceList
          entrances={entrances}
          selectedIds={selectedEntranceIds}
          variant="residential"
          setSelectedIds={setSelectedEntranceIds}
        />

        <BuildingEntranceMap apiKey={apiKey} entrances={selectedEntrances} />
      </div>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </>
  )
}
