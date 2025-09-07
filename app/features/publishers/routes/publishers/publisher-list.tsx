import { ChartBarIcon, EnvelopeIcon, EyeIcon, PencilIcon } from '@heroicons/react/24/outline'
import { Link, redirect } from 'react-router'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import { getPublishersWithGroup } from '~/features/publishers/server/publishers'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/publisher-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Proclamateurs - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canViewActivities = await verifyRole(request, Role.ActivityViewer)

  if (!canViewPublishers) {
    logger.warn(
      `Try to load publishers. User ID: ${currentUser.id}. Does NOT have rights to access groups and publishers.`,
    )

    throw redirect('/')
  }

  logger.info(
    `Loading publishers. User ID: ${currentUser.id}. ${canManagePublisher ? 'Has' : 'Does NOT have'} rights to manage groups and publishers.`,
  )

  const users = await getPublishersWithGroup()

  return {
    users: users.map(user => ({
      email: user.email,
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      isPublisher: user.isPublisher,
      publisherGroup: user.publisherGroup,
    })),
    canManagePublisher,
    canViewActivities,
  }
}

export default function PublisherListPage({ loaderData }: Route.ComponentProps) {
  const { users, canManagePublisher, canViewActivities } = loaderData

  if (users.length < 1) {
    return (
      <div className="flex flex-col">
        <HeroHeader
          title="Proclamateurs"
          subtitle="Liste de tous les fiches de proclamateurs de l'assemblée"
          actions={
            canManagePublisher && (
              <Link
                to="./new"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Créer proclamateur
              </Link>
            )
          }
        />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucun proclamateur pour le moment !</p>
          <p>
            Pour ajouter des proclamateurs utilisez le bouton "Créer proclamateur" an haut à droite de cette page ou
            créez des fiches de proclamateur à partir des utilisateurs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <HeroHeader
        title="Proclamateurs"
        subtitle="Liste de tous les fiches de proclamateurs de l'assemblée"
        actions={
          <>
            {canViewActivities && (
              <Link
                to="./activity"
                title="Consulter l'activité des proclamateurs"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                <ChartBarIcon className="inline size-6 max-sm:size-5" />
              </Link>
            )}
            {canManagePublisher && (
              <Link
                to="./new"
                className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
              >
                Créer proclamateur
              </Link>
            )}
          </>
        }
      />

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[150px] py-4 text-center max-sm:w-14 max-sm:text-left">Prénom</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Nom</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Groupe</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Contact</th>
            {canManagePublisher && <th className="w-[150px] py-4 text-center max-sm:w-14" />}
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {users.map(user => (
            <tr key={user.email} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3 text-center max-sm:text-left">
                <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-teal-600">
                  {user.firstname}
                </Link>
              </td>
              <td className="py-3 text-center">
                <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-teal-600">
                  {user.lastname?.toLocaleUpperCase()}
                </Link>
              </td>
              <td className="py-3 text-center">
                {user.publisherGroup != null && (
                  <Link
                    to={`/congregation/publisher-groups/${user.publisherGroup.id}/edit`}
                    className="hover:text-teal-600"
                  >
                    {user.publisherGroup.name}
                  </Link>
                )}
              </td>
              <td className="py-3 text-center max-sm:hidden">
                {user.email.includes('@placeholder.unitae.app') === false && (
                  <Link to={`mailto:${user.email}`} className="hover:text-teal-600">
                    <EnvelopeIcon className="inline size-5" />
                  </Link>
                )}
              </td>
              <td>
                <div className="flex items-stretch justify-end gap-3">
                  <Link to={`/congregation/publishers/${user.id}/view`} className="hover:text-teal-600">
                    <EyeIcon className="inline size-5" />
                  </Link>
                  {canManagePublisher && (
                    <Link to={`./${user.id}/edit`} className="text-teal-600">
                      <PencilIcon className="inline size-5" />
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
