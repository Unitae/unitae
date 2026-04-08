import { CalendarOff } from 'lucide-react'
import { Link, redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { computeFilters } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'
import { Button } from '~/shared/ui/button'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Programmes"
        subtitle="Liste de tous les évènements de l'assemblée"
        actions={
          roles.canManagePrograms && (
            <Button asChild>
              <Link to="./new">Nouvel évènement</Link>
            </Button>
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
      <EmptyState
        icon={CalendarOff}
        title="Il n'y a aucun évènement de planifié pour le moment !"
        description="Pour planifier un évènement, utilise le bouton &laquo; Nouvel évènement &raquo; en haut à droite de cette page."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex list-none flex-col gap-3 pl-0">{/* events */}</ul>

      <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
    </div>
  )
}
