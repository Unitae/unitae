import { CalendarOff } from 'lucide-react'
import { redirect } from 'react-router'
import { EventKind } from '~/features/events/model/event-kind.type'
import { computeFilters, getDefaultDateRange } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RelativeTime } from '~/shared/ui/RelativeTime'

import type { Route } from './+types/days-off'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_admin_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPrograms = permissions.has(Role.ProgramViewer)
  const canManagePrograms = permissions.has(Role.ProgramManager)

  if (!canViewPrograms) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)

    throw redirect('/')
  }

  logger.info(
    `Loading program list. User ID: ${currentUser.id}. ${canManagePrograms ? 'Has' : 'Does NOT have'} rights to manage programs.`,
  )

  const url = new URL(request.url)
  const selectors = computeFilters(url.searchParams)
  selectors.kind = { key: EventKind.Off }

  const defaults = getDefaultDateRange()
  const defaultFrom = defaults.from.toISOString().split('T')[0]
  const defaultTo = defaults.to.toISOString().split('T')[0]

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const events = await db.event.findMany({
      where: { ...selectors, congregationId },
      include: { createdBy: true },
      orderBy: [{ startDate: 'asc' }],
    })

    return {
      events,
      defaults: { from: defaultFrom, to: defaultTo },
      roles: { canManagePrograms },
    }
  })
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

type EventWithCreatedBy = Route.ComponentProps['loaderData']['events'][number]

function groupEventsByWeek(events: EventWithCreatedBy[]): Map<string, EventWithCreatedBy[]> {
  const groups = new Map<string, EventWithCreatedBy[]>()

  for (const event of events) {
    const monday = getMonday(new Date(event.startDate))
    const key = monday.toISOString().split('T')[0]

    const group = groups.get(key)
    if (group) {
      group.push(event)
    } else {
      groups.set(key, [event])
    }
  }

  return groups
}

export default function DaysOffListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], defaults } = loaderData
  const weekGroups = groupEventsByWeek(events)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.days_off_admin_page_title()}
        subtitle={m.days_off_admin_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_absences() }]}
      />

      <EventFilters defaults={defaults} />

      {events.length < 1 ? (
        <EmptyState
          icon={CalendarOff}
          title={m.days_off_admin_empty_title()}
          description={m.days_off_admin_empty_description()}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {[...weekGroups.entries()].map(([mondayKey, weekEvents]) => {
            const monday = new Date(mondayKey)
            const formattedDate = monday.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })

            return (
              <section key={mondayKey} className="flex flex-col gap-3">
                <h3 className="font-semibold text-muted-foreground text-sm">
                  {m.days_off_admin_week_of({ date: formattedDate })}
                </h3>
                <div className="flex flex-col gap-2">
                  {weekEvents.map(event => (
                    <Card key={event.id}>
                      <CardContent className="flex items-center justify-between py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-sm">
                            {m.days_off_admin_absence_of({
                              firstname: event.createdBy.firstname ?? '',
                              lastname: event.createdBy.lastname?.toLocaleUpperCase() ?? '',
                            })}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {m.days_off_admin_created_at_label()} <RelativeTime date={event.createdAt} />
                          </span>
                        </div>
                        <span className="text-muted-foreground text-sm">
                          {m.days_off_date_range({
                            startDate: new Date(event.startDate).toLocaleDateString('fr-FR', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'long',
                            }),
                            endDate: new Date(event.endDate).toLocaleDateString('fr-FR', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'long',
                            }),
                          })}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
