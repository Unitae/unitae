import { CalendarOff } from 'lucide-react'
import { redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { EventKind } from '~/features/events/model/event-kind.type'
import { computeFilters } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { paginationFromUrl } from '~/shared/libs/pagination.server'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Absences" subtitle="Liste de toutes les absences à la date sélectionnée." />

      <EventFilters />

      {events.length < 1 ? (
        <EmptyState
          icon={CalendarOff}
          title="Il n'y a aucune absence planifiée pour cette date !"
          description="Les absences s'afficheront une fois que les proclamateurs les auront indiquées dans leur profil."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {events.map(event => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="font-medium text-sm">
                  Absence de {event.createdBy.firstname} {event.createdBy.lastname?.toLocaleUpperCase()}
                </span>
                <span className="text-muted-foreground text-sm">
                  du {new Date(event.startDate).toLocaleDateString()} au {new Date(event.endDate).toLocaleDateString()}
                </span>
              </CardContent>
            </Card>
          ))}

          <Pagination pages={pagination.pages} page={pagination.page} size={pagination.size} total={pagination.total} />
        </div>
      )}
    </div>
  )
}
