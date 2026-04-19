import { useEffect, useState } from 'react'
import { Form, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeFilters } from '~/features/territories/server/building-filters.server'
import { findEntrancesPaginated } from '~/features/territories/server/buildings.server'
import BuildingEntranceList from '~/features/territories/ui/BuildingEntranceList'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import * as m from '~/paraglide/messages'
import { getBoolSetting } from '~/shared/domain/settings.server'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import Pagination from '~/shared/ui/Pagination'
import { getOptionalEnv } from '~/shared/utils/env.server'

import type { Route } from './+types/phones'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.split_tool_phones_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)

  if (!permissions.has(Role.TerritoriesViewer)) {
    throw redirect('/')
  }

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const { congregationId } = context.get(userContext)

  return withScopeFromContext(context, async db => {
    const phoneTypeActive = await getBoolSetting(db, TerritorySettingKey.TerritoryTypePhoneActive, congregationId)
    if (!phoneTypeActive) {
      throw redirect('/territories/buildings/split-territories')
    }

    const url = new URL(request.url)
    const filters = computeFilters(url.searchParams)
    const selectors: Prisma.BuildingEntranceWhereInput = {
      kind: 'residential',
      buildings: {
        some: {
          ...filters,
          active: true,
          // biome-ignore lint/style/useNamingConvention: prisma keywords
          NOT: { prospectionDate: null },
        },
      },
      // biome-ignore lint/style/useNamingConvention: prisma keywords
      OR: [{ phones: { gt: 0 } }, { access: 4, isOpenEarly: false }],
      territories: { none: { type: TerritoryKind.Phone } },
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
  const { entrances, pagination, apiKey } = loaderData
  const [selectedEntranceIds, setSelectedEntranceIds] = useState<number[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional dependency list
  useEffect(() => {
    setSelectedEntranceIds([])
  }, [entrances.map(el => el.id).join()])

  if (entrances.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center text-muted-foreground">
        <p>{m.split_tool_empty_phones()}</p>
        <p>{m.split_tool_empty_hint()}</p>
      </div>
    )
  }

  const selectedEntrances = entrances.filter(building => selectedEntranceIds.includes(building.id))

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-sm italic shadow-sm">
        {selectedEntranceIds.length > 0 ? (
          <>
            <p>
              {m.split_tool_creating_with_phones({
                count: entrances.reduce((countForTerritory, currentEntrance) => {
                  if (selectedEntranceIds.includes(currentEntrance.id)) {
                    return countForTerritory + (currentEntrance.phones ?? 0)
                  }

                  return countForTerritory
                }, 0),
              })}
            </p>
            <Form action="/territories/buildings/split-territories/create" method="post">
              <input type="hidden" name="type" value={TerritoryKind.Phone} />
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
          variant="phone"
          setSelectedIds={setSelectedEntranceIds}
        />

        <BuildingEntranceMap apiKey={apiKey} entrances={selectedEntrances} />
      </div>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </>
  )
}
