import { AlertTriangle, CalendarOff, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link, redirect } from 'react-router'
import { EventKind } from '~/features/events/model/event-kind.type'
import { computeFilters, getDefaultDateRange } from '~/features/events/server/event-filters.server'
import {
  type ConflictingEvent,
  computeDurationDays,
  getConflictsForWeek,
  getMonday,
  groupEventsByWeek,
} from '~/features/events/ui/days-off-helpers'
import EventFilters from '~/features/events/ui/EventFilters'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { Badge } from '~/shared/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { RelativeTime } from '~/shared/ui/RelativeTime'
import { cn } from '~/shared/utils/utils'

import type { Route } from './+types/days-off'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_admin_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canViewPrograms = permissions.has(Permission.ProgramViewer)

  if (!canViewPrograms) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)

    throw redirect('/')
  }

  logger.info(`Loading program list. User ID: ${currentUser.id}.`)

  const url = new URL(request.url)
  const selectors = computeFilters(url.searchParams)
  selectors.kind = { key: EventKind.Off }

  const defaults = getDefaultDateRange()
  const defaultFrom = defaults.from.toISOString().split('T')[0]
  const defaultTo = defaults.to.toISOString().split('T')[0]

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser

    const [rawEvents, publishers] = await Promise.all([
      db.event.findMany({
        where: { ...selectors, congregationId },
        include: { createdBy: { include: { member: { select: { id: true, firstname: true, lastname: true } } } } },
        orderBy: [{ startDate: 'asc' }],
      }),
      db.member.findMany({
        where: { congregationId, leftAt: null },
        orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
        select: { id: true, firstname: true, lastname: true },
      }),
    ])

    // Flatten the createdBy display name (Member when linked, account fallback otherwise)
    const events = rawEvents.map(e => ({
      ...e,
      createdBy: {
        firstname: e.createdBy.member?.firstname ?? e.createdBy.firstname,
        lastname: e.createdBy.member?.lastname ?? e.createdBy.lastname,
        memberId: e.createdBy.memberId,
      },
    }))

    // Find conflicting programme events for each day-off (with dates for per-week scoping)
    const conflictsByDayOff: Record<number, ConflictingEvent[]> = {}
    for (const event of events) {
      // Programme assignments are bound to Member ids; resolve via the creator's linked member
      const memberId = event.createdBy.memberId
      const [partAssignments, serviceAssignments] = memberId
        ? await Promise.all([
            db.programmePartAssignment.findMany({
              where: {
                hasConflict: true,
                congregationId,
                event: {
                  startDate: { lte: event.endDate },
                  endDate: { gte: event.startDate },
                  templateId: { not: null },
                },
                OR: [{ assigneeId: memberId }, { assistantId: memberId }],
              },
              select: { event: { select: { id: true, name: true, startDate: true } } },
            }),
            db.programmeServiceRoleAssignment.findMany({
              where: {
                hasConflict: true,
                congregationId,
                assigneeId: memberId,
                event: {
                  startDate: { lte: event.endDate },
                  endDate: { gte: event.startDate },
                  templateId: { not: null },
                },
              },
              select: { event: { select: { id: true, name: true, startDate: true } } },
            }),
          ])
        : [[], []]

      // Deduplicate by programme event ID
      const seen = new Set<number>()
      const conflicts: ConflictingEvent[] = []
      for (const a of [...partAssignments, ...serviceAssignments]) {
        if (!seen.has(a.event.id)) {
          seen.add(a.event.id)
          conflicts.push({
            eventId: a.event.id,
            eventName: a.event.name,
            eventDate: a.event.startDate.toISOString(),
          })
        }
      }

      if (conflicts.length > 0) conflictsByDayOff[event.id] = conflicts
    }

    // Check if any day-offs exist at all (for contextual empty state)
    const hasAnyDaysOff =
      events.length > 0 || (await db.event.count({ where: { congregationId, kind: { key: EventKind.Off } } })) > 0

    // Total conflict count for summary
    const totalConflicts = Object.values(conflictsByDayOff).reduce((sum, c) => sum + c.length, 0)

    return {
      events,
      publishers,
      conflictsByDayOff,
      totalConflicts,
      hasAnyDaysOff,
      defaults: { from: defaultFrom, to: defaultTo },
    }
  })
}

export default function DaysOffListPage({ loaderData }: Route.ComponentProps) {
  const { events = [], publishers, conflictsByDayOff, totalConflicts, hasAnyDaysOff, defaults } = loaderData
  const weekGroups = groupEventsByWeek(events)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleCollapse = (weekKey: string) => {
    setCollapsed(prev => ({ ...prev, [weekKey]: !prev[weekKey] }))
  }

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
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {totalConflicts > 0
              ? m.days_off_admin_summary_conflicts({
                  count: String(events.length),
                  conflicts: String(totalConflicts),
                })
              : m.days_off_admin_summary({ count: String(events.length) })}
          </p>

          {[...weekGroups.entries()].map(([mondayKey, weekEvents], index) => {
            const monday = new Date(mondayKey)
            const formattedDate = monday.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
            const isCollapsed = collapsed[mondayKey] ?? false
            const weekHasConflicts = weekEvents.some(e => {
              const allConflicts = conflictsByDayOff[e.id] ?? []
              return getConflictsForWeek(allConflicts, mondayKey).length > 0
            })

            return (
              <Card key={mondayKey} className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                <CardHeader className="pb-0">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(mondayKey)}
                    className="flex w-full cursor-pointer items-center gap-2 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        'size-5 text-muted-foreground transition-transform duration-200',
                        !isCollapsed && 'rotate-90',
                      )}
                    />
                    <CardTitle className="flex-1">{m.days_off_admin_week_of({ date: formattedDate })}</CardTitle>
                    <div className="flex items-center gap-2">
                      {weekHasConflicts && <AlertTriangle className="size-4 text-destructive" />}
                      <Badge variant="outline" className="text-xs">
                        {weekEvents.length}
                      </Badge>
                    </div>
                  </button>
                </CardHeader>

                <div
                  className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-in-out',
                    isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
                  )}
                >
                  <div className="overflow-hidden">
                    <CardContent className="pt-3 pb-2">
                      <div className="flex flex-col gap-1">
                        {weekEvents.map(event => {
                          const startDate = new Date(event.startDate)
                          const endDate = new Date(event.endDate)
                          const durationDays = computeDurationDays(startDate, endDate)
                          const eventStartMonday = getMonday(startDate).toISOString().split('T')[0]
                          const isContinuation = eventStartMonday !== mondayKey
                          const allConflicts = conflictsByDayOff[event.id] ?? []
                          const weekConflicts = getConflictsForWeek(allConflicts, mondayKey)
                          const hasConflicts = weekConflicts.length > 0

                          return (
                            <div key={event.id}>
                              <div
                                className={cn(
                                  'rounded-lg px-3 py-2.5',
                                  hasConflicts
                                    ? 'border-l-4 border-l-destructive bg-destructive/5'
                                    : isContinuation
                                      ? 'border-l-4 border-l-muted-foreground/20'
                                      : '',
                                )}
                              >
                                <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-sm">
                                        {m.days_off_admin_absence_of({
                                          firstname: event.createdBy.firstname ?? '',
                                          lastname: event.createdBy.lastname?.toLocaleUpperCase() ?? '',
                                        })}
                                      </span>
                                      {isContinuation && (
                                        <Badge variant="secondary" className="text-xs">
                                          {m.days_off_admin_continues()}
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-muted-foreground text-xs">
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
                                  </div>
                                  <span className="shrink-0 text-muted-foreground text-xs">
                                    {m.days_off_admin_created_at_label()} <RelativeTime date={event.createdAt} />
                                  </span>
                                </div>

                                {hasConflicts && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="destructive" className="gap-1 text-xs">
                                      <AlertTriangle className="size-3" />
                                      {m.days_off_admin_conflicts({ count: String(weekConflicts.length) })}
                                    </Badge>
                                    {weekConflicts.map(conflict => (
                                      <Link
                                        key={conflict.eventId}
                                        to={`/programs/events/${conflict.eventId}`}
                                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs transition-colors hover:bg-muted/80"
                                      >
                                        {conflict.eventName}
                                        <ChevronRight className="size-3" />
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
