import { AlertTriangle, CalendarOff } from 'lucide-react'
import { redirect } from 'react-router'
import { EventKind } from '~/features/events/model/event-kind.type'
import { computeFilters, getDefaultDateRange } from '~/features/events/server/event-filters.server'
import EventFilters from '~/features/events/ui/EventFilters'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Badge } from '~/shared/ui/badge'
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

    const [events, publishers] = await Promise.all([
      db.event.findMany({
        where: { ...selectors, congregationId },
        include: { createdBy: true },
        orderBy: [{ startDate: 'asc' }],
      }),
      db.user.findMany({
        where: { congregationId },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        select: { id: true, firstname: true, lastname: true },
      }),
    ])

    // Count conflicting assignments for each day-off
    const conflictCounts: Record<number, number> = {}
    for (const event of events) {
      const [partConflicts, serviceConflicts] = await Promise.all([
        db.programmePartAssignment.count({
          where: {
            hasConflict: true,
            congregationId,
            event: {
              startDate: { lte: event.endDate },
              endDate: { gte: event.startDate },
              templateId: { not: null },
            },
            // biome-ignore lint/style/useNamingConvention: prisma syntax
            OR: [{ assigneeId: event.createdById }, { assistantId: event.createdById }],
          },
        }),
        db.programmeServiceRoleAssignment.count({
          where: {
            hasConflict: true,
            congregationId,
            assigneeId: event.createdById,
            event: {
              startDate: { lte: event.endDate },
              endDate: { gte: event.startDate },
              templateId: { not: null },
            },
          },
        }),
      ])
      const total = partConflicts + serviceConflicts
      if (total > 0) conflictCounts[event.id] = total
    }

    // Check if any day-offs exist at all (for contextual empty state)
    const hasAnyDaysOff =
      events.length > 0 || (await db.event.count({ where: { congregationId, kind: { key: EventKind.Off } } })) > 0

    return {
      events,
      publishers,
      conflictCounts,
      hasAnyDaysOff,
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

function computeDurationDays(startDate: Date, endDate: Date): number {
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
}

export default function DaysOffListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], publishers, conflictCounts, hasAnyDaysOff, defaults } = loaderData
  const weekGroups = groupEventsByWeek(events)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.days_off_admin_page_title()}
        subtitle={m.days_off_admin_page_subtitle()}
        backTo="/programs"
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: m.sidebar_absences() }]}
      />

      <EventFilters defaults={defaults} publishers={publishers} />

      {events.length < 1 ? (
        hasAnyDaysOff ? (
          <EmptyState
            icon={CalendarOff}
            title={m.days_off_admin_empty_no_match_title()}
            description={m.days_off_admin_empty_no_match_description()}
          />
        ) : (
          <EmptyState
            icon={CalendarOff}
            title={m.days_off_admin_empty_title()}
            description={m.days_off_admin_empty_description()}
          />
        )
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
                  {weekEvents.map(event => {
                    const startDate = new Date(event.startDate)
                    const endDate = new Date(event.endDate)
                    const durationDays = computeDurationDays(startDate, endDate)
                    const conflicts = conflictCounts[event.id] ?? 0

                    return (
                      <Card key={event.id}>
                        <CardContent className="flex items-center justify-between py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {m.days_off_admin_absence_of({
                                  firstname: event.createdBy.firstname ?? '',
                                  lastname: event.createdBy.lastname?.toLocaleUpperCase() ?? '',
                                })}
                              </span>
                              {conflicts > 0 && (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <AlertTriangle className="size-3" />
                                  {m.days_off_admin_conflicts({ count: String(conflicts) })}
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {m.days_off_admin_created_at_label()} <RelativeTime date={event.createdAt} />
                            </span>
                          </div>
                          <span className="text-muted-foreground text-sm">
                            {m.days_off_date_range({
                              startDate: startDate.toLocaleDateString('fr-FR', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'long',
                              }),
                              endDate: endDate.toLocaleDateString('fr-FR', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'long',
                              }),
                            })}{' '}
                            {m.days_off_admin_duration({ count: String(durationDays) })}
                          </span>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
