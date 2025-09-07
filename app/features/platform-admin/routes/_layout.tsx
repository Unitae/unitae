import { BuildingOfficeIcon, Cog6ToothIcon, UsersIcon } from '@heroicons/react/24/outline'
import { Link, Outlet } from 'react-router'

import { verifyPlatformAdmin } from '~/features/platform-admin/server/verify-platform-admin.server'

import type { Route } from './+types/_layout'

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await verifyPlatformAdmin(request)
  return { admin }
}

export default function PlatformAdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <h1 className="mb-6 font-bold text-xl">
          <Link to="/platform-admin">Unitae Admin</Link>
        </h1>
        <nav className="flex flex-col gap-1">
          <Link
            to="/platform-admin/congregations"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <BuildingOfficeIcon className="size-5" />
            Congrégations
          </Link>
          <Link
            to="/platform-admin/users"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <UsersIcon className="size-5" />
            Utilisateurs
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
