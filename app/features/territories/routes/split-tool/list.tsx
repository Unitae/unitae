import { useEffect, useState } from 'react'
import { Form, redirect } from 'react-router'
import type { Prisma } from '~/database/generated/client'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { getBoolSetting } from '~/features/settings/server/settings'
import { getOptionalEnv } from '~/shared/libs/env.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { computeFilters } from '~/features/territories/server/building-filters'
import { findEntrancesPaginated } from '~/features/territories/server/buildings'
import BuildingEntranceList from '~/features/territories/ui/BuildingEntranceList'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'
import { Button } from '~/shared/ui/button'
import Pagination from '~/shared/ui/Pagination'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Découpage des territoires Porte à Porte - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)

  if (!canViewTerritories) {
    throw redirect('/')
  }

  const apiKey = getOptionalEnv('GOOGLE_MAPS_API_KEY')
  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)

  const url = new URL(request.url)
  const filters = computeFilters(url.searchParams)
  const selectors: Prisma.BuildingWhereInput = {
    ...filters,
    active: true,
    hasCampus: false,
    hasHotel: false,
    // biome-ignore lint/style/useNamingConvention: prisma keywords
    NOT: {
      prospectionDate: null,
    },
    // biome-ignore lint/style/useNamingConvention: prisma keywords
    OR: [
      { entrance: { access: 1 } }, // interphone
      { entrance: { access: 2 } }, // sonnette
      { hasShops: true, homes: { gt: 0 } }, // commerces si foyers dans le batiment
      phoneTypeActive ? { entrance: { access: 4, isOpenEarly: true } } : { entrance: { access: 4 } }, // code ouvert le matin ou tous les codes si territoires téléphone désactivé
    ],
    entrance: {
      territories: { none: { type: TerritoryKind.Classical } },
    },
  }

  const { entrances, pagination } = await findEntrancesPaginated(selectors, url)

  return {
    entrances,
    pagination,
    apiKey,
  }
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
        <p>Il n'y a aucun batiment pour le moment !</p>
        <p>Pour ajouter des batiments revenez sur la page "Prospection".</p>
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
              Création d'un territoire avec{' '}
              {entrances.reduce((countForTerritory, currentEntrance) => {
                if (selectedEntranceIds.includes(currentEntrance.id)) {
                  const countForEntrance = currentEntrance.buildings.reduce(
                    (count, currentBuilding) => count + (currentBuilding.homes ?? currentBuilding.phones ?? 0),
                    0,
                  )

                  return countForTerritory + countForEntrance
                }

                return countForTerritory
              }, 0)}{' '}
              foyers
            </p>
            <Form action="/territories/buildings/split-territories/create" method="post">
              <input type="hidden" name="type" value={TerritoryKind.Classical} />
              <input type="hidden" name="entranceIds" value={selectedEntranceIds.join(',')} />
              <Button type="submit" size="sm">
                Créer le territoire
              </Button>
            </Form>
          </>
        ) : (
          <p className="text-muted-foreground">Aucun batiment sélectionné</p>
        )}
      </div>

      <div className="flex min-h-[500px] grow gap-7">
        <BuildingEntranceList
          entrances={entrances}
          selectedIds={selectedEntranceIds}
          setSelectedIds={setSelectedEntranceIds}
        />

        <BuildingEntranceMap apiKey={apiKey} entrances={selectedEntrances} />
      </div>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </>
  )
}
