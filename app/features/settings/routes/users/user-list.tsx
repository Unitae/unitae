import {
  CheckBadgeIcon,
  IdentificationIcon,
  PencilIcon,
  PercentBadgeIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import { Form, Link, redirect } from 'react-router'

import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'

import type { Route } from './+types/user-list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManageUser = await verifyRole(request, Role.SettingsUserManager)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublishers = await verifyRole(request, Role.PublisherManager)

  if (!canManageUser) {
    logger.warn(`Tried to load users. User ID: ${currentUser.id}. Does NOT have rights to manage users.`)

    throw redirect('/')
  }

  logger.info(
    `Loading users. User ID: ${currentUser.id}. ${canManageUser ? 'Has' : 'Does NOT have'} rights to manage users.`,
  )

  const users = await db.user.findMany({
    include: {
      congregationRoles: { include: { role: true } },
    },
    orderBy: [
      {
        lastname: 'asc',
      },
      {
        firstname: 'asc',
      },
    ],
  })

  return {
    users: users.map(user => ({
      email: user.email.includes('@placeholder.unitae.app') ? null : user.email,
      roles: user.congregationRoles.map(cr => cr.role),
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      isAdmin: user.congregationRoles.some(cr => cr.role.key === 'admin'),
      isPublisher: user.isPublisher,
    })),
    roles: {
      canViewPublishers,
      canManageUser,
      canManagePublishers,
    },
  }
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const { users, roles } = loaderData

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Utilisateurs</h1>
          <p className="text-gray-500 max-sm:text-sm">Liste de tous les utilisateurs de Unitae</p>
        </div>
        <div>
          <Link
            to="./new"
            className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          >
            Nouvel utilisateur
          </Link>
        </div>
      </div>

      <table className="mt-6 table grow border-collapse">
        <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
          <tr>
            <th className="w-[150px] py-4 max-sm:w-14">Prénom</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Nom</th>
            <th className="px-1 py-4 text-center max-sm:hidden">Email</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14">Proclamateur</th>
            <th className="w-[150px] py-4 text-center max-sm:hidden">Droits</th>
            <th className="w-[150px] py-4 text-center max-sm:w-14 max-sm:text-right" />
          </tr>
        </thead>
        <tbody className="text-left max-sm:text-sm">
          {users.map(user => (
            <tr key={user.email} className="border-b border-b-slate-200 dark:border-b-slate-800">
              <td className="py-3">{user.firstname}</td>
              <td className="py-3 text-center">{user.lastname?.toLocaleUpperCase()}</td>
              <td className="py-3 text-center max-sm:hidden">{user.email ?? '-'}</td>
              <td className="py-3 text-center text-teal-600">
                {user.isPublisher ? (
                  roles.canViewPublishers ? (
                    <Link
                      to={`/congregation/publishers/${user.id}/view`}
                      title="Voir la fiche proclamateur de cet utilisateur"
                    >
                      <IdentificationIcon className="inline size-5" />
                    </Link>
                  ) : (
                    <IdentificationIcon className="inline size-5" />
                  )
                ) : (
                  roles.canManagePublishers && (
                    <Form method="POST" action={`./${user.id}/make-publisher`}>
                      <button type="submit" title="Créer automatiquement une fiche proclamateur pour cet utilisateur">
                        <UserPlusIcon className="inline size-5" />
                      </button>
                    </Form>
                  )
                )}
              </td>
              <td className="py-3 text-center text-sm max-sm:hidden">
                {user.isAdmin ? (
                  <CheckBadgeIcon
                    className="inline size-5 text-yellow-500"
                    title="Utilisateur ayant les droits administrateur"
                  />
                ) : user.roles.length > 0 ? (
                  <PercentBadgeIcon
                    className="inline size-5 text-slate-500"
                    title="Utilisateur qui possède des droits supplémentaires"
                  />
                ) : null}
              </td>
              <td className="py-3 text-center max-sm:text-right">
                <Link to={`./${user.id}/edit`} className="text-teal-600">
                  <PencilIcon className="inline size-5" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
