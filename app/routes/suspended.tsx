import { Link } from 'react-router'

import { getHostSettings } from '~/shared/libs/host-settings.server'

import type { Route } from './+types/suspended'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Compte suspendu - Unitae' }]
}

export function loader() {
  const hostSettings = getHostSettings()

  return {
    billingUrl: hostSettings.billing?.portalUrl ?? null,
  }
}

export default function SuspendedPage({ loaderData }: Route.ComponentProps) {
  const { billingUrl } = loaderData

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-4 font-bold text-2xl text-gray-900">Compte suspendu</h1>
        <p className="mb-6 text-gray-600">
          L'accès à votre congrégation a été temporairement suspendu. Si vous pensez qu'il s'agit d'une erreur, veuillez
          contacter l'administrateur.
        </p>
        <div className="flex flex-col gap-3">
          {billingUrl && (
            <a href={billingUrl} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
              Gérer mon abonnement
            </a>
          )}
          <Link to="/logout" className="text-gray-500 text-sm hover:text-gray-700">
            Se déconnecter
          </Link>
        </div>
      </div>
    </div>
  )
}
