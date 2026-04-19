import { Link } from 'react-router'
import * as m from '~/paraglide/messages'

import { getHostSettings } from '~/shared/domain/host-settings.server'

import type { Route } from './+types/trial-expired'

export const meta: Route.MetaFunction = () => {
  return [{ title: "Période d'essai terminée - Unitae" }]
}

export function loader() {
  const hostSettings = getHostSettings()
  const isMultiTenant = process.env.MULTI_TENANT === 'true'

  return {
    upgradeUrl: isMultiTenant ? (hostSettings.billing?.upgradeUrl ?? null) : null,
  }
}

export default function TrialExpiredPage({ loaderData }: Route.ComponentProps) {
  const { upgradeUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">{m.trial_expired_title()}</h1>
        <p className="mb-6 text-gray-600">{m.trial_expired_message()}</p>
        <div className="flex flex-col gap-3">
          {upgradeUrl && (
            <a href={upgradeUrl} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              {m.trial_expired_upgrade()}
            </a>
          )}
          <Link to="/logout" className="text-gray-500 text-sm hover:text-gray-700">
            {m.trial_expired_logout()}
          </Link>
        </div>
      </div>
    </div>
  )
}
