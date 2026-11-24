import { Status } from '@unitae/ui'
import { CalendarDays, FileText, ListPlus, Loader2, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { Link, useFetcher } from 'react-router'
import { EventStatus } from '~/features/events/model/event-status.type'
import type { ScheduleAddOptions } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { PageHeader } from '~/shared/ui/PageHeader'
import { ScheduleAddMenu } from './ScheduleAddMenu'

interface EventHeaderProps {
  event: { id: number; name: string; status: string }
  subtitle: string
  /** A meeting created ahead with no programme yet: « Créer le programme » replaces publishing it. */
  awaitingProgramme: boolean
  /** « Tout publier » on an event holding schedules (D43); null for one without, which publishes as a whole. */
  publishAll: { count: number; everyone: boolean } | null
  /** « Ajouter un planning » (D39): what the reader may add, and the event's kind its suggestions come from. */
  addSchedule: { options: ScheduleAddOptions; eventKindName: string | null }
  canRelease: boolean
  canUnrelease: boolean
  canEdit: boolean
  canCreateProgramme: boolean
  canDelete: boolean
  onDelete: () => void
}

/** The event's title and status, and what the reader may do with it as a whole; each schedule's section says its own. */
export function EventHeader({
  event,
  subtitle,
  awaitingProgramme,
  publishAll,
  addSchedule,
  canRelease,
  canUnrelease,
  canEdit,
  canCreateProgramme,
  canDelete,
  onDelete,
}: EventHeaderProps) {
  const { options } = addSchedule
  const mayAdd = options.suggested.length + options.others.length + options.emptyKinds.length > 0
  return (
    <PageHeader
      icon={CalendarDays}
      title={event.name}
      subtitle={subtitle}
      meta={
        <>
          <EventStatusBadge
            awaitingProgramme={awaitingProgramme}
            bySchedule={publishAll != null}
            status={event.status}
          />
        </>
      }
      breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: event.name }]}
      actions={
        // Only when something shows: with schedules the header publishes their drafts, each section withdrawing its own.
        (canEdit || mayAdd || (publishAll != null ? publishAll.count > 0 : canRelease || canUnrelease)) && (
          <>
            {mayAdd && (
              <ScheduleAddMenu eventId={event.id} eventKindName={addSchedule.eventKindName} options={options} />
            )}
            <EventPublishAction
              eventId={event.id}
              awaitingProgramme={awaitingProgramme}
              publishAll={publishAll}
              canRelease={canRelease}
              canUnrelease={canUnrelease}
              canCreateProgramme={canCreateProgramme}
            />
            {canEdit && (
              <>
                <Button variant="outline" asChild>
                  <Link to={`/programs/events/${event.id}/edit`}>
                    <Pencil />
                    {m.common_edit()}
                  </Link>
                </Button>
                {canDelete && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                        <Trash2 />
                        {m.common_delete()}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </>
        )
      }
    />
  )
}

/** The event's own status, for one without schedules; with them each section carries its own. */
function EventStatusBadge({
  awaitingProgramme,
  bySchedule,
  status,
}: {
  awaitingProgramme: boolean
  bySchedule: boolean
  status: string
}) {
  if (awaitingProgramme) return <Status tone="neutral">{m.programs_awaiting_badge()}</Status>
  if (bySchedule) return null
  if (status === EventStatus.Draft) return <Status tone="warning">{m.programs_event_draft_badge()}</Status>
  return <Status tone="success">{m.programs_view_released()}</Status>
}

/**
 * Publishing from the header: « Créer le programme » while a meeting awaits it; « Tout publier » on an event holding
 * schedules (D43), each section withdrawing its own; « Publier » / « Retirer » on one without (D46).
 */
function EventPublishAction({
  eventId,
  awaitingProgramme,
  publishAll,
  canRelease,
  canUnrelease,
  canCreateProgramme,
}: {
  eventId: number
  awaitingProgramme: boolean
  publishAll: { count: number; everyone: boolean } | null
  canRelease: boolean
  canUnrelease: boolean
  canCreateProgramme: boolean
}) {
  if (awaitingProgramme) return canCreateProgramme ? <CreateProgrammeButton eventId={eventId} /> : null
  if (publishAll != null) return publishAll.count > 0 ? <PublishAllButton eventId={eventId} {...publishAll} /> : null
  return (
    <>
      {canRelease && <PublishButton eventId={eventId} release />}
      {canUnrelease && <PublishButton eventId={eventId} release={false} />}
    </>
  )
}

/** « Tout publier », or « Publier votre planning » for a responsible (D43): the drafts the reader may publish. */
function PublishAllButton({ eventId, count, everyone }: { eventId: number; count: number; everyone: boolean }) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const inFlight = fetcher.state !== 'idle'
  return (
    <Button
      onClick={() => fetcher.submit({}, { method: 'POST', action: `/programs/events/${eventId}/release` })}
      disabled={inFlight}
    >
      {inFlight ? <Loader2 className="animate-spin" /> : <Send />}
      {everyone ? m.programs_publish_all() : m.programs_publish_mine({ count })}
    </Button>
  )
}

function CreateProgrammeButton({ eventId }: { eventId: number }) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const inFlight = fetcher.state !== 'idle'
  return (
    <Button
      onClick={() => fetcher.submit({}, { method: 'POST', action: `/programs/events/${eventId}/create-programme` })}
      disabled={inFlight}
    >
      {inFlight ? <Loader2 className="animate-spin" /> : <ListPlus />}
      {m.programs_create_programme_button()}
    </Button>
  )
}

/** « Publier » or « Retirer » on an event holding no schedule, which publishes as a whole (D46). */
function PublishButton({ eventId, release }: { eventId: number; release: boolean }) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const action = release ? `/programs/events/${eventId}/release` : `/programs/events/${eventId}/unrelease`
  const label = release ? m.programs_event_release_button() : m.programs_event_unrelease_button()
  const Icon = release ? Send : FileText
  const inFlight = fetcher.state !== 'idle'

  return (
    <Button
      variant={release ? 'default' : 'outline'}
      onClick={() => fetcher.submit({}, { method: 'POST', action })}
      disabled={inFlight}
    >
      {inFlight ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </Button>
  )
}
