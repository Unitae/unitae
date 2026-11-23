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
  /** How many of the shown parts and services have someone; null where that block is not shown. */
  partsAssigned: { count: number; total: number } | null
  servicesFilled: { count: number; total: number } | null
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
          {awaitingProgramme ? (
            <Status tone="neutral">{m.programs_awaiting_badge()}</Status>
          ) : event.status === EventStatus.Draft ? (
            <Status tone="warning">{m.programs_event_draft_badge()}</Status>
          ) : (
            <Status tone="success">{m.programs_view_released()}</Status>
          )}
          {partsAssigned && <span>{m.programs_view_parts_assigned(partsAssigned)}</span>}
          {servicesFilled && <span>{m.programs_view_services_filled(servicesFilled)}</span>}
        </>
      }
      breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: event.name }]}
      actions={
        (canRelease || canUnrelease || canEdit) && (
          <>
            {awaitingProgramme ? (
              canCreateProgramme && <CreateProgrammeButton eventId={event.id} />
            ) : (
              <>
                {canRelease && <PublishButton eventId={event.id} release />}
                {canUnrelease && <PublishButton eventId={event.id} release={false} />}
              </>
            )}
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
