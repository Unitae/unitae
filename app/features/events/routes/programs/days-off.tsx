import { CalendarOff } from 'lucide-react'
import { redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { EventKind } from '~/features/events/model/event-kind.type'
import { computeFilters } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { paginationFromUrl } from '~/shared/utils/pagination.server'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import Pagination from '~/shared/ui/Pagination'

import type { Route } from './+types/days-off'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_admin_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.ProgramViewer,
    Role.ProgramManager,
  ])
  const canViewPrograms = can(Role.ProgramViewer)
  const canManagePrograms = can(Role.ProgramManager)

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

  return withScope(congregationId, async db => {
    logger.info(selectors)
    const totalAttributions = await db.event.count({ where: { ...selectors, congregationId } })
    const pagination = paginationFromUrl(url, totalAttributions)
    const events = await db.event.findMany({
      skip: pagination.offset,
      take: pagination.size,
      where: { ...selectors, congregationId },
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
  })
}

export default function DaysOffListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], pagination } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.days_off_admin_page_title()} subtitle={m.days_off_admin_page_subtitle()} />

      <EventFilters />

      {events.length < 1 ? (
        <EmptyState
          icon={CalendarOff}
          title={m.days_off_admin_empty_title()}
          description={m.days_off_admin_empty_description()}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {events.map(event => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-3">
                <span className="font-medium text-sm">
                  {m.days_off_admin_absence_of({
                    firstname: event.createdBy.firstname ?? '',
                    lastname: event.createdBy.lastname?.toLocaleUpperCase() ?? '',
                  })}
                </span>
                <span className="text-muted-foreground text-sm">
                  {m.days_off_date_range({
                    startDate: new Date(event.startDate).toLocaleDateString(),
                    endDate: new Date(event.endDate).toLocaleDateString(),
                  })}
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
