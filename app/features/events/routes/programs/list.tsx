import {
  AlertTriangle,
  CalendarOff,
  ChevronRight,
  FileDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Send,
  Trash2,
  UserCog,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, redirect, useFetcher } from 'react-router'
import { toast } from 'sonner'
import { EventStatus } from '~/features/events/model/event-status.type'
import { ProgrammeTemplateKey } from '~/features/events/model/programme-template.type'
import { computeFilters, getDefaultDateRange } from '~/features/events/server/event-filters.server'
import { getResponsibleTemplateIds } from '~/features/events/server/programme-auth.server'
import EventFilters from '~/features/events/ui/EventFilters'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { EmptyState } from '~/shared/ui/EmptyState'
import { PageHeader } from '~/shared/ui/PageHeader'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'

import type { Route } from './+types/list'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  if (!permissions.has(Permission.ProgramViewer)) {
    logger.warn(`Try to load programs. User ID: ${currentUser.id}. Does NOT have rights to access programs.`)
    throw redirect('/')
  }

  logger.info(`Loading program list. User ID: ${currentUser.id}.`)

  const url = new URL(request.url)
  const filters = computeFilters(url.searchParams)
  const defaults = getDefaultDateRange()
  const defaultFrom = defaults.from.toISOString().split('T')[0]
  const defaultTo = defaults.to.toISOString().split('T')[0]

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser

    const isProgramManager = permissions.has(Permission.ProgramManager)
    const responsibleTemplateIds = isProgramManager
      ? []
      : await getResponsibleTemplateIds(db, currentUser.id, congregationId)
    const responsibleTemplateIdSet = new Set(responsibleTemplateIds)

    const events = await db.event.findMany({
      where: {
        ...filters,
        congregationId,
        NOT: { template: { key: ProgrammeTemplateKey.DayOff } },
      },
      include: {
        template: true,
        _count: {
          select: {
            partAssignments: { where: { hasConflict: true } },
            serviceRoleAssignments: { where: { hasConflict: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const upcomingEvents = events.map(event => ({
      ...event,
      canEdit: isProgramManager || (event.templateId != null && responsibleTemplateIdSet.has(event.templateId)),
      conflictCount: event._count.partAssignments + event._count.serviceRoleAssignments,
    }))

    return {
      upcomingEvents,
      defaults: { from: defaultFrom, to: defaultTo },
      timezone: context.get(congregationContext).timezone,
      roles: {
        canCreatePrograms: isProgramManager || responsibleTemplateIds.length > 0,
        canViewExternalSpeakers:
          permissions.has(Permission.ExternalSpeakerViewer) || permissions.has(Permission.ExternalSpeakerManager),
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

function eventTimeOrEmpty(date: Date, timezone: string): string {
  const time = formatEventTime(date, timezone)
  return time === '00:00' ? '' : time
}

function ConflictBadge({ count }: { count: number }) {
  const label =
    count === 1
      ? m.programs_event_conflict_badge_singular()
      : m.programs_event_conflict_badge_plural({ count: String(count) })
  return (
    <span
      role="status"
      aria-label={m.programs_event_conflict_badge_aria({ count: String(count) })}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-400"
    >
      <AlertTriangle className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
      <FileText className="size-3" aria-hidden="true" />
      {m.programs_event_draft_badge()}
    </span>
  )
}

function EventRow({
  event,
  timezone,
  selected,
  onToggleSelection,
  showCheckboxSlot,
}: {
  event: Event
  timezone: string
  selected: boolean
  onToggleSelection: () => void
  showCheckboxSlot: boolean
}) {
  const weekday = formatEventDate(event.startDate, timezone, 'fr-FR', { weekday: 'long' })
  const time = eventTimeOrEmpty(new Date(event.startDate), timezone)
  const isUpcoming = new Date(event.startDate) >= new Date()
  const showConflictBadge = isUpcoming && event.conflictCount > 0
  const isDraft = event.status === EventStatus.Draft
  const cardStyle = { borderLeftColor: event.template?.color ?? 'transparent', borderLeftWidth: '4px' }
  const kindLabel = event.template ? ` · ${event.template.name}` : ''
  const timeLabel = time ? ` · ${time}` : ''

  return (
    <Card
      data-selected={selected}
      className="group overflow-hidden transition-colors hover:bg-muted data-[selected=true]:bg-primary/5 data-[selected=true]:ring-1 data-[selected=true]:ring-primary/20 data-[selected=true]:hover:bg-primary/10"
      style={cardStyle}
    >
      <CardContent className="flex items-center gap-3 py-3">
        {showCheckboxSlot && (
          <div className="flex size-4 shrink-0 items-center justify-center" aria-hidden={!event.canEdit}>
            {event.canEdit && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelection}
                aria-label={m.programs_bulk_select_event({ name: event.name })}
                className="size-4 rounded border border-input/60 accent-primary opacity-60 transition-opacity checked:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
              />
            )}
          </div>
        )}
        <Link to={`./events/${event.id}`} className="flex flex-1 items-center justify-between gap-3 no-underline">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm">{event.name}</span>
            <span className="text-muted-foreground text-xs capitalize">
              {weekday}
              {timeLabel}
              {kindLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isDraft && <DraftBadge />}
            {showConflictBadge && <ConflictBadge count={event.conflictCount} />}
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </Link>
      </CardContent>
    </Card>
  )
}

function WeekCheckbox({
  events,
  selectedIds,
  onToggleWeek,
  ariaLabel,
}: {
  events: Event[]
  selectedIds: Set<number>
  onToggleWeek: (ids: number[], select: boolean) => void
  ariaLabel: string
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
      aria-label={ariaLabel}
      className="size-4 rounded border border-input accent-primary"
    />
  )
}

export default function ProgramListPage({ loaderData }: Route.ComponentProps) {
  const { upcomingEvents, roles, defaults, timezone } = loaderData
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkFetcher = useFetcher<{ ok: boolean; error?: 'invalid_payload' }>()
  const bulkStatusFetcher = useFetcher<{ ok: boolean; error?: 'invalid_payload' }>()

  const weekGroups = groupByWeek(upcomingEvents)
  const editableIds = upcomingEvents.filter(e => e.canEdit).map(e => e.id)
  const hasEditableEvents = editableIds.length > 0
  const isDeleting = bulkFetcher.state !== 'idle'
  const isChangingStatus = bulkStatusFetcher.state !== 'idle'

  const selectedEvents = upcomingEvents.filter(e => selectedIds.has(e.id))
  const anyDraftSelected = selectedEvents.some(e => e.status === EventStatus.Draft)
  const anyReleasedSelected = selectedEvents.some(e => e.status === EventStatus.Released)

  useEffect(() => {
    if (bulkFetcher.state !== 'idle') return
    if (bulkFetcher.data?.ok === true) {
      setSelectedIds(new Set())
    }
    // Same client-side surface for the delete fetcher — the layout flash
    // won't fire for a shape rejection.
    if (bulkFetcher.data?.ok === false && bulkFetcher.data?.error === 'invalid_payload') {
      toast.error(m.programs_bulk_invalid_payload())
    }
  }, [bulkFetcher.state, bulkFetcher.data])

  useEffect(() => {
    if (bulkStatusFetcher.state !== 'idle') return
    if (bulkStatusFetcher.data?.ok === true) {
      setSelectedIds(new Set())
    }
    // Server-side flash toasts (via commitSession) drive the success/blocked
    // messages. `invalid_payload` is a shape rejection so no flash cookie is
    // set — surface a client-side toast so the user isn't left staring at a
    // spinner that stops.
    if (bulkStatusFetcher.data?.ok === false && bulkStatusFetcher.data?.error === 'invalid_payload') {
      toast.error(m.programs_bulk_invalid_payload())
    }
  }, [bulkStatusFetcher.state, bulkStatusFetcher.data])

  function toggleSelection(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === editableIds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(editableIds))
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

  function bulkRelease() {
    const ids = selectedEvents.filter(e => e.status === EventStatus.Draft).map(e => e.id)
    if (ids.length === 0) return
    bulkStatusFetcher.submit({ ids }, { method: 'POST', action: '/programs/bulk-release', encType: 'application/json' })
  }

  function bulkUnrelease() {
    const ids = selectedEvents.filter(e => e.status === EventStatus.Released).map(e => e.id)
    if (ids.length === 0) return
    bulkStatusFetcher.submit(
      { ids },
      { method: 'POST', action: '/programs/bulk-unrelease', encType: 'application/json' },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.programs_page_title()}
        subtitle={m.programs_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_programs() }]}
        actions={
          <div className="flex gap-2">
            {roles.canCreatePrograms && (
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={m.common_more_actions()}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {roles.canViewExternalSpeakers && (
                  <DropdownMenuItem asChild>
                    <Link to="./external-speakers">
                      <UserCog className="size-4" />
                      {m.sidebar_external_speakers()}
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="./days-off">
                    <CalendarOff className="size-4" />
                    {m.programs_days_off_button()}
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <EventFilters defaults={defaults} />

      {upcomingEvents.length > 0 ? (
        <div className="flex flex-col gap-6">
          {hasEditableEvents && selectedIds.size > 0 && (
            <section
              aria-label={m.programs_bulk_actions_aria()}
              className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border bg-background/95 py-2 pr-4 pl-5 backdrop-blur sm:pl-7"
            >
              <input
                type="checkbox"
                checked={selectedIds.size === editableIds.length}
                onChange={toggleAll}
                aria-label={m.programs_bulk_actions_aria()}
                className="size-4 rounded border border-input accent-primary"
              />
              <span className="flex-1 text-muted-foreground text-sm">
                {m.programs_bulk_selected({ count: selectedIds.size })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                {m.programs_bulk_deselect()}
              </Button>
              {anyDraftSelected && (
                <Button variant="default" size="sm" onClick={bulkRelease} disabled={isChangingStatus}>
                  {isChangingStatus ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {m.programs_bulk_release()}
                </Button>
              )}
              {anyReleasedSelected && (
                <Button variant="outline" size="sm" onClick={bulkUnrelease} disabled={isChangingStatus}>
                  {isChangingStatus ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                  {m.programs_bulk_unrelease()}
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="size-4" />
                {m.programs_bulk_delete()}
              </Button>
            </section>
          )}

          {weekGroups.map(({ weekKey, weekMonday, events }) => {
            const editableWeekEvents = events.filter(e => e.canEdit)
            const showCheckboxSlot = editableWeekEvents.length > 0
            const weekDate = formatEventDate(weekMonday, timezone, 'fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
            return (
              <div key={weekKey} className="flex flex-col gap-2">
                <div className="flex items-center gap-3 pl-5 sm:pl-7">
                  {showCheckboxSlot && (
                    <WeekCheckbox
                      events={editableWeekEvents}
                      selectedIds={selectedIds}
                      onToggleWeek={toggleWeek}
                      ariaLabel={m.programs_week_select_all_aria({ date: weekDate })}
                    />
                  )}
                  <div className="flex flex-1 items-center gap-3">
                    <span className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                      {m.programs_week_header_count({ date: weekDate, count: events.length })}
                    </span>
                    <div className="flex-1 border-border border-t" />
                  </div>
                </div>

                {events.map(event => (
                  <EventRow
                    key={event.id}
                    event={event}
                    timezone={timezone}
                    selected={selectedIds.has(event.id)}
                    onToggleSelection={() => toggleSelection(event.id)}
                    showCheckboxSlot={showCheckboxSlot}
                  />
                ))}
              </div>
            )
          })}
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
