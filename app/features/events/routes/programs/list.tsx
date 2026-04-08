import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { computeFilters } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import Pagination from '~/shared/ui/Pagination'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Programmes - Unitae' }]
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

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], pagination, roles } = loaderData

  return (
    <div className="flex flex-col gap-5">
      <HeroHeader
        title="Programmes"
        subtitle="Liste de tous les évènements de l'assemblée"
        actions={
          roles.canManagePrograms && (
            <Link
              to="./new"
              className="flex items-center rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2 max-sm:text-sm"
            >
              Nouvel évènement
            </Link>
          )
        }
      />

      <EventFilters />

      <ProgramEventList events={events} pagination={pagination} />
    </div>
  )
}

function ProgramEventList({
  events = [],
  pagination,
}: {
  pagination: ReturnType<typeof paginationFromUrl>
  events: unknown[]
}) {
  if (events.length < 1) {
    return (
      <div className="my-20 flex flex-col items-center justify-center gap-2 px-2 text-center">
        <p>Il n'y a aucun évènement de planifié pour le moment !</p>
        <p>Pour planifier un évènement, utilise le bouton "Nouvel évènement" en haut à droite de cette page. </p>
      </div>
    )
  }

  return (
    <div className="flex grow flex-col gap-3">
      <ul className="flex list-none flex-col gap-3 pl-0">{/* events */}</ul>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </div>
  )
}
