import { CalendarOff, ChevronRight, FileDown, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, redirect, useFetcher } from 'react-router'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)

  if (!permissions.has(Role.ProgramViewer)) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)
    throw redirect('/')
  }

  logger.info(`Loading program list. User ID: ${currentUser.id}.`)

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const now = new Date()
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const upcomingEvents = await db.event.findMany({
      where: {
        congregationId,
        startDate: { gte: startOfCurrentMonth },
        // biome-ignore lint/style/useNamingConvention: prisma syntax
        NOT: { kind: { key: 'off' } },
      },
      include: { template: true, kind: true },
      orderBy: { startDate: 'asc' },
    })

    return {
      upcomingEvents,
      roles: {
        canManagePrograms: permissions.has(Role.ProgramManager),
      },
    }
  })
}

function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

type Event = Awaited<ReturnType<typeof loader>>['upcomingEvents'][number]

function groupByWeek(events: Event[]): { weekKey: string; weekMonday: Date; events: Event[] }[] {
  const map = new Map<string, { weekMonday: Date; events: Event[] }>()

  for (const event of events) {
    const monday = getWeekMonday(new Date(event.startDate))
    const key = monday.toISOString()
    const entry = map.get(key)
    if (entry) {
      entry.events.push(event)
    } else {
      map.set(key, { weekMonday: monday, events: [event] })
    }
  }

  return Array.from(map.entries()).map(([weekKey, { weekMonday, events: evts }]) => ({
    weekKey,
    weekMonday,
    events: evts,
  }))
}

function formatEventTime(date: Date): string {
  const time = new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return time === '00:00' ? '' : time
}

function WeekCheckbox({
  events,
  selectedIds,
  onToggleWeek,
}: {
  events: Event[]
  selectedIds: Set<number>
  onToggleWeek: (ids: number[], select: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const allSelected = events.length > 0 && events.every(e => selectedIds.has(e.id))
  const someSelected = events.some(e => selectedIds.has(e.id))

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = someSelected && !allSelected
    }
  }, [someSelected, allSelected])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={() =>
        onToggleWeek(
          events.map(e => e.id),
          !allSelected,
        )
      }
      className="size-4 rounded border border-input accent-primary"
    />
  )
}

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { upcomingEvents, roles } = loaderData
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkFetcher = useFetcher<{ ok: boolean }>()

  const weekGroups = groupByWeek(upcomingEvents)
  const allIds = upcomingEvents.map(e => e.id)
  const isDeleting = bulkFetcher.state !== 'idle'

  useEffect(() => {
    if (bulkFetcher.state === 'idle' && bulkFetcher.data?.ok === true) {
      setSelectedIds(new Set())
    }
  }, [bulkFetcher.state, bulkFetcher.data])

  function toggleSelection(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function toggleWeek(ids: number[], select: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function confirmBulkDelete() {
    bulkFetcher.submit(
      { ids: [...selectedIds] },
      { method: 'POST', action: '/programs/bulk-delete', encType: 'application/json' },
    )
    setBulkDeleteOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_page_title()}
        subtitle={m.programs_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_programs() }]}
        actions={
          <div className="flex gap-2">
            {roles.canManagePrograms && (
              <Button asChild>
                <Link to="./new">{m.programs_new_event_button()}</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="./export-pdf">
                <FileDown className="size-4" />
                {m.programs_export_pdf_button()}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="./days-off">{m.programs_days_off_button()}</Link>
            </Button>
          </div>
        }
      />

      {upcomingEvents.length > 0 ? (
        <div className="flex flex-col gap-6">
          {roles.canManagePrograms && selectedIds.size > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border bg-background/95 px-4 py-2 backdrop-blur">
              <input
                type="checkbox"
                checked={selectedIds.size === allIds.length}
                onChange={toggleAll}
                className="size-4 rounded border border-input accent-primary"
              />
              <span className="flex-1 text-muted-foreground text-sm">
                {m.programs_bulk_selected({ count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {m.programs_bulk_deselect()}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="size-4" />
                {m.programs_bulk_delete()}
              </Button>
            </div>
          )}

          {weekGroups.map(({ weekKey, weekMonday, events }) => (
            <div key={weekKey} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {roles.canManagePrograms && (
                  <WeekCheckbox events={events} selectedIds={selectedIds} onToggleWeek={toggleWeek} />
                )}
                <div className="flex flex-1 items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {m.programs_week_header_count({
                      date: weekMonday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
                      count: events.length,
                    })}
                  </span>
                  <div className="flex-1 border-t border-border" />
                </div>
              </div>

              {events.map(event => {
                const weekday = new Date(event.startDate).toLocaleDateString('fr-FR', { weekday: 'long' })
                const time = formatEventTime(new Date(event.startDate))

                return (
                  <div key={event.id} className="flex items-center gap-3">
                    {roles.canManagePrograms && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(event.id)}
                        onChange={() => toggleSelection(event.id)}
                        className="size-4 rounded border border-input accent-primary"
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                    <Link to={`./events/${event.id}`} className="no-underline flex-1">
                      <Card
                        className="transition-colors hover:bg-muted/50 overflow-hidden"
                        style={event.kind?.color ? { borderLeftColor: event.kind.color, borderLeftWidth: '4px' } : {}}
                      >
                        <CardContent className="flex items-center justify-between py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{event.name}</span>
                            <span className="text-muted-foreground text-xs capitalize">
                              {weekday}
                              {time ? ` · ${time}` : ''}
                              {event.kind ? ` · ${event.kind.name}` : ''}
                            </span>
                          </div>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarOff} title={m.programs_empty_title()} description={m.programs_empty_description()} />
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{m.programs_bulk_delete_confirm_title({ count: selectedIds.size })}</AlertDialogTitle>
            <AlertDialogDescription>{m.programs_bulk_delete_confirm_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmBulkDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
