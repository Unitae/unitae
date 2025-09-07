import { ArrowUpRightIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { data, Link, redirect } from 'react-router'

import { getZips } from '~/features/territories/server/buildings'
import { computeFilters } from '~/features/territories/server/territory-filters'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import Pagination from '~/shared/ui/Pagination'
import { AlertMessages } from '~/shared/ui/AlertMessages'
import { checkAvailabilityStatus, TerritoryAvaibilityStatus } from '~/features/territories/ui/TerritoryAvaibilityStatus'
import TerritoryFilters from '~/features/territories/ui/TerritoryFilters'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { findAvailableTerritoriesPaginated } from '~/features/territories/server/territories'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/territories'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Attribution d'un territoire - Unitae` }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canManageTerritories) {
    logger.warn(
      `Tried to load territories available for attribution. User ID: ${currentUser.id}. Does NOT have rights to manage territories.`,
    )
    throw redirect('/')
  }

  logger.info(`Loading territories available for attribution. User ID: ${currentUser.id}.`)

  const url = new URL(request.url)
  const selectors = await computeFilters(url.searchParams)
  selectors.attributions = { none: { endDate: null } }

  const { territories, pagination } = await findAvailableTerritoriesPaginated(selectors, url)

  const messages = { success: session.get('success'), error: session.get('error') }
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
      canManageTerritories,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function TerritorySelectorPage({ loaderData }: Route.ComponentProps) {
  const { messages, pagination, territories, zips } = loaderData

  if (territories.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <AlertMessages messages={messages} />
        <HeroHeader title="Territoires disponibles" subtitle="Sélectionnez le territoire à attribuer au proclamateur" />
        <TerritoryFilters zips={zips} showAccess showSearch showType showZip />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun territoire disponible pour le moment !</p>
          <p>
            Pour ajouter des territoires, utilisez le bouton "Nouveau territoire" sur la page liste des territoires ou
            visitez le module de découpage des territoires sur la page de prospection.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <AlertMessages messages={messages} />
      <HeroHeader title="Territoires disponibles" subtitle="Sélectionnez le territoire à attribuer au proclamateur" />
      <TerritoryFilters zips={zips} showZip showAccess showSearch showType />

      <div className="flex grow flex-col gap-3">
        <table className="table grow border-collapse">
          <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
            <tr>
              <th className="w-[150px] py-4 max-sm:w-14 max-sm:text-center">Nº</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Type</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Foyer</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Statut</th>
              <th className="w-[150px] py-4 text-center max-sm:w-12" />
            </tr>
          </thead>
          <tbody className="text-left max-sm:text-sm">
            {territories.map(territory => (
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
                <td className="py-3 text-center">
                  <TerritoryAvaibilityStatus attribution={[...territory.attributions].shift()} />
                </td>
                <td>
                  <div className="flex justify-end gap-4 px-3 max-sm:px-0">
                    <Link
                      to={`/territories/territory/${territory.id}/edit`}
                      className="hover:text-teal-600"
                      title="Voir le détail du territoire"
                    >
                      <ArrowUpRightIcon className="inline size-5" />
                    </Link>
                    {checkAvailabilityStatus([...territory.attributions].shift()) ? (
                      <Link
                        to={`/territories/attributions/new?territory=${territory.id}`}
                        className="inline-flex items-center gap-1 text-teal-600 underline-offset-3 hover:underline"
                        title="Atrribuer ce territoire"
                      >
                        <span className="max-sm:hidden">Attribuer</span>
                        <PaperAirplaneIcon className="inline size-5 -rotate-12" />
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <span className="max-sm:hidden">Attribuer</span>
                        <PaperAirplaneIcon className="inline size-5 -rotate-12" />
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
