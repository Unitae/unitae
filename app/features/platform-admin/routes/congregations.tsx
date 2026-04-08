import { PencilIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'
import { unscopedDb } from '~/shared/libs/db.server'

import type { Route } from './+types/congregations'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Congrégations - Unitae Admin' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifyPlatformAdmin(request)

  const congregations = await unscopedDb.congregation.findMany({
    include: {
      _count: {
        select: { users: true, territories: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return {
    congregations: congregations.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      domain: c.domain,
      active: c.active,
      userCount: c._count.users,
      territoryCount: c._count.territories,
      createdAt: c.createdAt,
    })),
  }
}

export default function CongregationsPage({ loaderData }: Route.ComponentProps) {
  const { congregations } = loaderData

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-2xl">Congrégations</h2>
        <span className="text-sm text-gray-500">{congregations.length} congrégation(s)</span>
      </div>

      <table className="w-full border-collapse">
        <thead className="border-b border-slate-300 text-left text-sm font-semibold dark:border-slate-600">
          <tr>
            <th className="py-3">Nom</th>
            <th className="py-3">Slug</th>
            <th className="py-3 text-center">Utilisateurs</th>
            <th className="py-3 text-center">Territoires</th>
            <th className="py-3 text-center">Statut</th>
            <th className="py-3 text-center">Créée le</th>
            <th className="py-3" />
          </tr>
        </thead>
        <tbody className="text-sm">
          {congregations.map(c => (
            <tr key={c.id} className="border-b border-slate-200 dark:border-slate-700">
              <td className="py-3 font-medium">{c.name}</td>
              <td className="py-3 text-gray-500">{c.slug}</td>
              <td className="py-3 text-center">{c.userCount}</td>
              <td className="py-3 text-center">{c.territoryCount}</td>
              <td className="py-3 text-center">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                >
                  {c.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="py-3 text-center text-gray-500">{new Date(c.createdAt).toLocaleDateString('fr')}</td>
              <td className="py-3 text-center">
                <Link to={`/platform-admin/congregations/${c.id}/edit`} className="text-teal-600 hover:text-teal-800">
                  <PencilIcon className="inline size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
