import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'

import type { Route } from './+types/users'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Utilisateurs - Unitae Admin' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const users = await unscopedDb.user.findMany({
    include: {
      congregation: { select: { name: true, slug: true } },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    take: 100,
  })

  return {
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      firstname: u.firstname,
      lastname: u.lastname,
      active: u.active,
      platformAdmin: u.platformAdmin,
      congregationName: u.congregation.name,
      congregationSlug: u.congregation.slug,
    })),
  }
}

export default function UsersPage({ loaderData }: Route.ComponentProps) {
  const { users } = loaderData

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-2xl">Utilisateurs</h2>
        <span className="text-sm text-gray-500">{users.length} utilisateur(s)</span>
      </div>

      <table className="w-full border-collapse">
        <thead className="border-b border-slate-300 text-left text-sm font-semibold dark:border-slate-600">
          <tr>
            <th className="py-3">Nom</th>
            <th className="py-3">Email</th>
            <th className="py-3">Congrégation</th>
            <th className="py-3 text-center">Statut</th>
            <th className="py-3 text-center">Admin plateforme</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {users.map(u => (
            <tr key={u.id} className="border-b border-slate-200 dark:border-slate-700">
              <td className="py-3 font-medium">
                {u.firstname ?? ''} {u.lastname ?? ''}
              </td>
              <td className="py-3 text-gray-500">{u.email}</td>
              <td className="py-3">{u.congregationName}</td>
              <td className="py-3 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                >
                  {u.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
              <td className="py-3 text-center">
                {u.platformAdmin && (
                  <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    Admin
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
