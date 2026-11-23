import { Status } from '@unitae/ui'
import { CalendarDays, FileText, ListPlus, Loader2, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { Link, useFetcher } from 'react-router'
import { EventStatus } from '~/features/events/model/event-status.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { PageHeader } from '~/shared/ui/PageHeader'

interface EventHeaderProps {
  event: { id: number; name: string; status: string }
  subtitle: string
  /** A meeting created ahead with no programme yet: « Créer le programme » replaces publishing it. */
  awaitingProgramme: boolean
  /**
   * How many parts and services have someone, for an event without schedules; null otherwise (each schedule's section
   * says it), while the programme awaits its creation, and for services when there is none.
   */
  partsAssigned: { count: number; total: number } | null
  servicesFilled: { count: number; total: number } | null
  /** « Tout publier » on an event holding schedules (D43); null for one without, which publishes as a whole. */
  publishAll: { count: number; everyone: boolean } | null
  canRelease: boolean
  canUnrelease: boolean
  canEdit: boolean
  canCreateProgramme: boolean
  canDelete: boolean
  onDelete: () => void
}

/** The event's title, status and counts, and what the reader may do with it as a whole. */
export function EventHeader({
  event,
  subtitle,
  awaitingProgramme,
  partsAssigned,
  servicesFilled,
  publishAll,
  canRelease,
  canUnrelease,
  canEdit,
  canCreateProgramme,
  canDelete,
  onDelete,
}: EventHeaderProps) {
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
          {partsAssigned && <span>{m.programs_view_parts_assigned(partsAssigned)}</span>}
          {servicesFilled && <span>{m.programs_view_services_filled(servicesFilled)}</span>}
        </>
      }
      breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: event.name }]}
      actions={
        (canRelease || canUnrelease || canEdit || (publishAll?.count ?? 0) > 0) && (
          <>
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

/** The event's own status, for one without schedules; with them each section carries its own (5c). */
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

/** « Publier » (every draft schedule of the reader's) or « Retirer » (every published one), D43. */
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
