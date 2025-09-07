import type { Prisma } from '~/database/generated/client'
import { useEffect, useState } from 'react'
import { Form, redirect } from 'react-router'

import { getSetting } from '~/features/settings/server/settings'
import { computeFilters } from '~/features/territories/server/building-filters'
import { findEntrancesPaginated } from '~/features/territories/server/buildings'
import Pagination from '~/shared/ui/Pagination'
import BuildingEntranceList from '~/features/territories/ui/BuildingEntranceList'
import BuildingEntranceMap from '~/features/territories/ui/BuildingEntranceMap'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/hotels'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Découpage des territoires Hotels - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)

  if (!canViewTerritories) {
    throw redirect('/')
  }

  const apiKey = await getSetting(TerritorySettingKey.GoogleMapsApiKey)
  const url = new URL(request.url)
  const filters = computeFilters(url.searchParams)
  const selectors: Prisma.BuildingWhereInput = {
    ...filters,
    active: true,
    // biome-ignore lint/style/useNamingConvention: prisma keywords
    NOT: {
      prospectionDate: null,
    },
    hasHotel: true,
    entrance: { territories: { none: { type: TerritoryKind.Hotel } } },
  }
  const { entrances, pagination } = await findEntrancesPaginated(selectors, url)

  return {
    entrances,
    pagination,
    apiKey,
  }
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
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
        <p>Il n'y a aucun batiment avec des hotels pour le moment !</p>
        <p>Pour ajouter des batiments revenez sur la page "Prospection".</p>
      </div>
    )
  }

  const selectedEntrances = entrances.filter(entrance => selectedEntranceIds.includes(entrance.id))

  return (
    <>
      <div className="sticky top-0 flex items-center gap-3 py-4 italic max-sm:px-4 dark:bg-slate-950">
        {selectedEntranceIds.length > 0 ? (
          <>
            <p>
              Création d'un territoire avec {selectedEntranceIds.length} hôtel
              {selectedEntranceIds.length > 1 && 's'}
            </p>
            <Form action="/territories/buildings/split-territories/create" method="post">
              <input type="hidden" name="type" value={TerritoryKind.Hotel} />
              <input type="hidden" name="entranceIds" value={selectedEntranceIds.join(',')} />
              <button
                type="submit"
                className="rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2"
              >
                Créer le territoire
              </button>
            </Form>
          </>
        ) : (
          <p>Aucun batiment sélectionné</p>
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
