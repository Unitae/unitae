import { redirect } from 'react-router'

import { HeroHeader } from '~/shared/ui/HeroHeader'
import Pagination from '~/shared/ui/Pagination'
import EventFilters from '~/features/events/ui/EventFilters'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { computeFilters } from '~/features/events/server/event-filters.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'
import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Absences - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPrograms = await verifyRole(request, Role.ProgramViewer)
  const canManagePrograms = await verifyRole(request, Role.ProgramManager)

  if (!canViewPrograms) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)

    throw redirect('/')
  }

  logger.info(
    `Loading program list. User ID: ${currentUser.id}. ${canManagePrograms ? 'Has' : 'Does NOT have'} rights to manage programs.`,
  )

  const url = new URL(request.url)
  const selectors = computeFilters(url.searchParams)
  selectors.kind = { key: EventKind.Off } // Filter only for days off events
  logger.info(selectors)
  const totalAttributions = await db.event.count({ where: selectors })
  const pagination = paginationFromUrl(url, totalAttributions)
  const events = await db.event.findMany({
    skip: pagination.offset,
    take: pagination.size,
    where: selectors,
    include: { createdBy: true },
    orderBy: [{ startDate: 'asc' }],
  })

  return {
    events,
    pagination,
    roles: {
      canManagePrograms,
    },
  }
}

export default function DaysOffListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], pagination } = loaderData

  if (events.length < 1) {
    return (
      <div className="flex flex-col gap-5">
        <HeroHeader title="Absences" subtitle="Liste de toutes les absences à la date sélectionnée." />

        <EventFilters />

        <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
          <p>Il n'y a aucune absence planifié pour cette date !</p>
          <p>Les absences s'afficheront une fois que les proclamateurs les auront indiqué dans leur profile</p>
          <p>Essayez de recharger la page ou de vérifier vos paramètres de filtre.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <HeroHeader
        title="Absences"
        subtitle="Liste de toutes les absences"
        // actions={
        //   canManagePrograms && (
        //     <Link
        //       to="./new"
        //       className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
        //     >
        //       Nouvel évènement
        //     </Link>
        //   )
        // }
      />

      <EventFilters />

      <div className="flex grow flex-col gap-3">
        <ul className="flex list-none flex-col gap-3 pl-0">
          {events.map(event => (
            <li key={event.id} className="flex justify-between rounded-md bg-slate-50 p-3 shadow-md dark:bg-gray-800">
              <span>
                Absence de {event.createdBy.firstname} {event.createdBy.lastname?.toLocaleUpperCase()}
              </span>
              <span>
                du {new Date(event.startDate).toLocaleDateString()} au {new Date(event.endDate).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>

        <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
      </div>
    </div>
  )
}
