import { XMarkIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { getNextDaysOffs } from '~/features/events/server/days-off.server'
import logger from '~/shared/libs/logger.server'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mes absences - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session } = await verifySession(request)
  const events = await getNextDaysOffs(currentUser.id)

  logger.info(`Loading personal Days Off list. User ID: ${currentUser.id}`)

  return {
    user: currentUser,
    events,
    error: session.get('error'),
  }
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData

  return (
    <div className="flex h-screen flex-col">
      <HeroHeader
        title="Mes absences"
        subtitle="Gérez vos absences. Dès que vous avez prévu de vous absenter, ajoutez une absence pour que les frères en charge des programmes puissent en tenir compte."
        actions={
          <Link
            to={'./new'}
            title="Ajouter une absence"
            className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
          >
            Nouvelle absence
          </Link>
        }
      />

      <div className="my-4">
        {events.length > 0 ? (
          <ul className="flex list-none flex-col gap-3 pl-0">
            {events.map(event => (
              <li key={event.id} className="flex justify-between rounded-md bg-slate-50 p-3 shadow-md dark:bg-gray-800">
                <span>
                  du {new Date(event.startDate).toLocaleDateString()} au {new Date(event.endDate).toLocaleDateString()}
                </span>
                <span>
                  <Link to={`/me/days-off/${event.id}/delete`} title="Annuler l'attribution" className={'text-red-600'}>
                    <XMarkIcon className={'inline size-6'} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucune absence prévue.</p>
        )}
      </div>
    </div>
  )
}
