import { EyeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { findBuildingsPaginated, getProspectionStaleDate } from '~/features/territories/server/buildings'
import { BuildingStatus } from '~/features/territories/ui/BuildingStatus'
import Pagination from '~/shared/ui/Pagination'

import type { Route } from './+types/missing-building-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Batiments manquants dans BANO - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canViewProspection = await verifyRole(request, Role.ProspectionViewer)
  const canManageProspection = await verifyRole(request, Role.ProspectionManager)
  const canManageTerritories = await verifyRole(request, Role.TerritoriesManager)

  if (!canViewProspection) {
    throw redirect('/')
  }

  const staleDate = await getProspectionStaleDate()

  const selectors = { inOpenData: false, active: true }
  const url = new URL(request.url)
  const { buildings, pagination } = await findBuildingsPaginated(selectors, url)

  return {
    buildings,
    pagination,
    staleDate,
    canManageTerritories,
    canManageProspection,
    canViewProspection,
  }
}

export default function BuildingListPage({ loaderData }: Route.ComponentProps) {
  const { buildings, pagination, staleDate, canManageProspection, canViewProspection } = loaderData

  if (buildings.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
        <p>Il n'y a aucun batiment potentiellement détruit pour le moment !</p>
        <p>
          Si des batiments actifs n'apparaissent plus dans les données de la <em>Base d'Adresses Nationale Ouverte</em>{' '}
          fournie par l'état, il apparaitront ici pour être prospectés.
        </p>
      </div>
    )
  }

  return (
    <>
      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[150px] py-4 max-sm:w-14 max-sm:text-center">Code Postal</th>
            <th className="px-1 py-4 max-sm:text-center">Rue</th>
            <th className="w-[150px] text-ellipsis text-wrap px-1 py-4 text-center max-sm:w-12">Nº</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Statut</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Latitude</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Longitude</th>
            {canViewProspection && <th className="w-[150px] py-4 text-center max-sm:w-12" />}
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {buildings.map(building => (
            <tr key={building.id} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3 max-sm:text-center">{building.zip}</td>
              <td className="px-1 py-3 max-sm:text-center">{building.street}</td>
              <td className="py-3 text-center">{building.number}</td>
              <td className="py-3 text-center">
                <BuildingStatus building={building} options={{ staleDate }} />
              </td>
              <td className="py-3 text-center max-sm:hidden">{building.latitude ?? '?'}</td>
              <td className="py-3 text-center max-sm:hidden">{building.longitude ?? '?'}</td>
              {canViewProspection && (
                <td className="py-3 text-center">
                  <div className="flex items-center gap-3">
                    <Link to={`../../building/${building.id}/view`} className="text-teal-600 hover:text-teal-800">
                      <EyeIcon className="inline size-6 max-sm:size-5" />
                    </Link>
                    {canManageProspection && (
                      <Link
                        to={`../../building/${building.id}/edit-prospection`}
                        relative="path"
                        className="text-teal-600 hover:text-teal-800"
                      >
                        <MagnifyingGlassIcon className="inline size-6 max-sm:size-5" />
                      </Link>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </>
  )
}
