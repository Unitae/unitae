import { Link } from 'react-router'
import * as m from '~/paraglide/messages'

import { getHostSettings } from '~/shared/libs/host-settings.server'

import type { Route } from './+types/suspended'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Compte suspendu - Unitae' }]
}

export function loader({ request }: Route.LoaderArgs) {
  const hostSettings = getHostSettings()
  const url = new URL(request.url)
  const isMultiTenant = process.env.MULTI_TENANT === 'true'

  return {
    reason: url.searchParams.get('reason'),
    supportUrl: isMultiTenant ? (hostSettings.support?.url ?? null) : null,
  }
}

export default function SuspendedPage({ loaderData }: Route.ComponentProps) {
  const { reason, supportUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.suspended_title()}</h1>
        <p className="mb-6 text-gray-600">{reason ? reason : m.suspended_message_default()}</p>
        <div className="flex flex-col gap-3">
          {supportUrl && (
            <a href={supportUrl} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {m.suspended_contact_support()}
            </a>
          )}
          <Link to="/logout" className="text-gray-500 text-sm hover:text-gray-700">
            {m.suspended_logout()}
          </Link>
        </div>
      </div>
    </div>
  )
}
