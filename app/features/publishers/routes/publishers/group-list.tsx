import { EyeIcon, PencilIcon } from '@heroicons/react/24/outline'
import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/group-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Proclamateurs - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publisher groups. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publisher groups. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  const groups = await db.publisherGroup.findMany({
    include: {
      responsible: true,
      deputy: true,
      _count: { select: { members: { where: { isPublisher: true } } } },
    },
    orderBy: [{ name: 'asc' }],
  })
  return {
    groups,
    canManagePublisher,
  }
}

export default function GroupListPage({ loaderData }: Route.ComponentProps) {
  const { groups = [], canManagePublisher } = loaderData

  if (groups.length < 1) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
          <div>
            <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Groupes de prédication</h1>
            <p className="text-gray-500 max-sm:text-sm">Liste de tous les groupes de prédication</p>
          </div>
          <div>
            {canManagePublisher && (
              <Link
                to="./new"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Nouveau groupe
              </Link>
            )}
          </div>
        </div>
        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun groupe de prédication pour le moment !</p>
          <p>
            Pour ajouter des groupes de prédication utilisez le bouton "Nouveau groupe" an haut à droite de cette page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Groupes de prédication</h1>
          <p className="text-gray-500 max-sm:text-sm">Liste de tous les groupes de prédication</p>
        </div>
        <div>
          {canManagePublisher && (
            <Link
              to="./new"
              className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
            >
              Nouveau groupe
            </Link>
          )}
        </div>
      </div>

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[200px] py-4 max-sm:w-14">Nom</th>
            <th className="w-[250px] py-4 text-center max-sm:hidden">Responsable</th>
            <th className="w-[250px] py-4 text-center max-sm:hidden">Adjoint</th>
            <th className="px-1 py-4 text-center max-sm:hidden">Adresse</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Proclamateurs</th>
            {canManagePublisher && <th className="w-[150px] px-1 py-4 text-center max-sm:w-14" />}
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {groups.map(group => (
            <tr key={group.name} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3">
                <Link to={`./${group.id}/view`} className="hover:text-teal-600">
                  {group.name.toLocaleUpperCase()}
                </Link>
              </td>
              <td className="py-3 text-center max-sm:hidden">
                <Link to={`/congregation/publishers/${group.responsibleId}/view`} className="hover:text-teal-600">
                  {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
                </Link>
              </td>
              <td className="py-3 text-center max-sm:hidden">
                <Link to={`/congregation/publishers/${group.deputyId}/view`} className="hover:text-teal-600">
                  {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
                </Link>
              </td>
              <td className="py-3 text-center max-sm:hidden">{group.adress}</td>
              <td className="py-3 text-center">{group._count.members}</td>
              <td className="flex justify-end gap-3 px-1 py-3">
                {canManagePublisher && (
                  <Link to={`./${group.id}/edit`} className="text-teal-600">
                    <PencilIcon className="inline size-5" />
                  </Link>
                )}
                <Link to={`./${group.id}/view`} className="text-teal-600">
                  <EyeIcon className="inline size-5" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
