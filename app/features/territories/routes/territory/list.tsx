import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { data, Link, redirect } from 'react-router'

import { getBoolSetting, getSetting } from '~/features/settings/server/settings'
import { getZips } from '~/features/territories/server/buildings'
import { computeFilters } from '~/features/territories/server/territory-filters'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import Pagination from '~/shared/ui/Pagination'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { TerritoryDownloadLink } from '~/features/territories/ui/TerritoryDownloadLink'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import type { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findTerritoriesWithDetailsPaginated } from '~/features/territories/server/territories'
import { TerritorySettingKey } from '~/shared/types/territory-setting-key'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Tous les territoires - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
  const canViewTerritories = await verifyRole(request, Role.TerritoriesViewer)

  if (!canViewTerritories) {
    throw redirect('/')
  }

  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  const phoneTypeActive = await getBoolSetting(TerritorySettingKey.TerritoryTypePhoneActive)
  const apiKey = await getSetting(TerritorySettingKey.GoogleMapsApiKey)
  const mapId = await getSetting(TerritorySettingKey.GoogleMapsMapId)

  const url = new URL(request.url)
  const selectors = await computeFilters(url.searchParams)
  const { territories, pagination } = await findTerritoriesWithDetailsPaginated(selectors, url)

  const messages = {
    success: session.get('success'),
    error: session.get('error'),
  }
  const zips = await getZips()

  return data(
    {
      messages,
      zips,
      stats: {
        total: pagination.total,
      },
      territories,
      pagination,
      googleMaps: { mapId, apiKey },
      canManageTerritories,
      phoneTypeActive,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function TerritoryListPage({ loaderData }: Route.ComponentProps) {
  const {
    messages,
    pagination,
    territories,
    canManageTerritories,
    googleMaps: { mapId, apiKey },
    zips,
    phoneTypeActive,
  } = loaderData

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />

        <HeroHeader
          title="Territoires"
          subtitle="Liste des territoires de l'assemblée locale"
          actions={
            canManageTerritories && (
              <Link
                to="./territory/new"
                title="Créer manuellement un nouveau territoire"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Nouveau territoire
              </Link>
            )
          }
        />

        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun territoire pour le moment !</p>
          <p>
            Pour ajouter des territoires, utilisez le bouton "Nouveau territoire" ou visitez le module de découpage des
            territoires sur la page de prospection.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <HeroHeader
        title="Territoires"
        subtitle="Liste des territoires de l'assemblée locale"
        actions={
          canManageTerritories && (
            <Link
              to="./territory/new"
              title="Créer manuellement un nouveau territoire"
              className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
            >
              Nouveau territoire
            </Link>
          )
        }
      />

      <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

      <div className="flex grow flex-col gap-3">
        <table className="table grow border-collapse">
          <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
            <tr>
              <th className="w-[150px] py-4 max-sm:w-14 max-sm:text-center">Nº</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Type</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Foyer</th>
              <th className="w-[150px] py-4 text-center max-sm:w-12" />
            </tr>
          </thead>
          <tbody className="text-left max-sm:text-sm">
            {territories.map(territory => {
              const attribution = [...territory.attributions].shift()

              return (
                <tr key={territory.id} className="border-b border-b-slate-200 dark:border-b-slate-800">
                  <td className="py-3 max-sm:text-center">{territory.number}</td>
                  <td className="py-3 text-center">
                    {territory.type === TerritoryKind.Classical && 'Porte à porte'}
                    {territory.type === TerritoryKind.Commerces && 'Commerces'}
                    {territory.type === TerritoryKind.Phone && 'Téléphones'}
                    {territory.type === TerritoryKind.Hotel && 'Hôtels'}
                    {territory.type === TerritoryKind.Univ && 'Universités'}
                  </td>
                  <td className="py-3 text-center">
                    {territory.entrances.reduce(
                      (countForTerritory, currentEntrance) =>
                        countForTerritory +
                        currentEntrance.buildings.reduce(
                          (countForEntrance, currentBuilding) =>
                            countForEntrance + (currentBuilding.homes ?? currentBuilding.phones ?? 0),
                          0,
                        ),
                      0,
                    )}
                  </td>
                  <td>
                    <div className="flex items-stretch justify-end gap-3">
                      <TerritoryDownloadLink
                        territory={territory}
                        entrances={territory.entrances}
                        googleMapId={mapId}
                        googleMapKey={apiKey}
                        attributionType={attribution?.type as TerritoryAttributionKind}
                        owner={
                          attribution
                            ? `${attribution.publisher.firstname} ${attribution.publisher.lastname
                                ?.toUpperCase()
                                .at(0)}.`
                            : undefined
                        }
                        restitutionDate={attribution?.lateDate}
                        showPhone={!phoneTypeActive}
                      />
                      {canManageTerritories && (
                        <>
                          <Link
                            to={`./territory/${territory.id}/edit`}
                            className="text-teal-600"
                            title="Modifier le territoire"
                          >
                            <PencilIcon className="inline size-6" />
                          </Link>
                          <Link
                            to={`./territory/${territory.id}/delete`}
                            title="Supprimer complètement le territoire"
                            className="inline text-red-600 max-sm:hidden"
                          >
                            <TrashIcon className={'inline size-6 max-sm:size-5'} />
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
