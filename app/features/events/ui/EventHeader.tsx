import { Status } from '@unitae/ui'
import { FileText, ListPlus, Loader2, MoreHorizontal, Pencil, Send, Shapes, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { EventStatus } from '~/features/events/model/event-status.type'
import { publishActionShown } from '~/features/events/model/publish-action'
import type { ScheduleAddOptions } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DateChip } from '~/shared/ui/DateChip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PublishUnfilledDialog } from './PublishUnfilledDialog'
import { ScheduleAddMenu } from './ScheduleAddMenu'

interface EventHeaderProps {
  event: { id: number; name: string; status: string; startDate: Date | string }
  timeZone: string
  subtitle: string
  /** A meeting created ahead with no programme yet: « Créer le programme » replaces publishing it. */
  awaitingProgramme: boolean
  /** « Tout publier » on an event holding schedules (D43); null for one without, which publishes as a whole. */
  publishAll: { count: number; everyone: boolean; unfilled: number } | null
  /** « Ajouter un planning » (D39): what the reader may add, and the event's kind its suggestions come from. */
  addSchedule: { options: ScheduleAddOptions; eventKindName: string | null }
  canRelease: boolean
  canUnrelease: boolean
  canEdit: boolean
  canCreateProgramme: boolean
  canDelete: boolean
  onDelete: () => void
  /** « Changer le type » (D40), for whoever may move the meeting to another kind. */
  onChangeKind?: () => void
}

/** The event's title and status, and what the reader may do with it as a whole; each schedule's section says its own. */
export function EventHeader({
  event,
  timeZone,
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
  onChangeKind,
}: EventHeaderProps) {
  const { options } = addSchedule
  // Something it can add: a greyed suggestion alone offers nothing.
  const mayAdd =
    options.suggested.some(option => option.unavailable == null) ||
    options.others.length + options.emptyKinds.length > 0
  return (
    <PageHeader
      leading={<DateChip date={event.startDate} timeZone={timeZone} />}
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
      // The board's title row: publishing the drafts, then adding a schedule; the top bar keeps the meeting's own.
      controls={
        (mayAdd ||
          publishActionShown({ awaitingProgramme, canCreateProgramme, publishAll, canRelease, canUnrelease })) && (
          <>
            <EventPublishAction
              eventId={event.id}
              awaitingProgramme={awaitingProgramme}
              publishAll={publishAll}
              canRelease={canRelease}
              canUnrelease={canUnrelease}
              canCreateProgramme={canCreateProgramme}
            />
            {mayAdd && (
              <ScheduleAddMenu eventId={event.id} eventKindName={addSchedule.eventKindName} options={options} />
            )}
          </>
        )
      }
      actions={
        canEdit && (
          <>
            {canEdit && (
              <>
                <Button variant="ghost" asChild>
                  <Link to={`/programs/events/${event.id}/edit`}>
                    <Pencil />
                    {m.programs_edit_event()}
                  </Link>
                </Button>
                {(canDelete || onChangeKind) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onChangeKind && (
                        <DropdownMenuItem onSelect={onChangeKind}>
                          <Shapes />
                          {m.programs_kind_change()}
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                          <Trash2 />
                          {m.common_delete()}
                        </DropdownMenuItem>
                      )}
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
  publishAll: { count: number; everyone: boolean; unfilled: number } | null
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
function PublishAllButton({
  eventId,
  count,
  everyone,
  unfilled,
}: {
  eventId: number
  count: number
  everyone: boolean
  /** The slots nobody holds in the drafts it publishes: it asks first when there are some. */
  unfilled: number
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const [asking, setAsking] = useState(false)
  const inFlight = fetcher.state !== 'idle'
  const submit = () => fetcher.submit({}, { method: 'POST', action: `/programs/events/${eventId}/release` })
  return (
    <>
      <Button onClick={() => (unfilled > 0 ? setAsking(true) : submit())} disabled={inFlight}>
        {inFlight ? <Loader2 className="animate-spin" /> : <Send />}
        {everyone ? m.programs_publish_all() : m.programs_publish_mine({ count })}
      </Button>
      <PublishUnfilledDialog
        open={asking}
        unfilled={unfilled}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          submit()
        }}
      />
    </>
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
