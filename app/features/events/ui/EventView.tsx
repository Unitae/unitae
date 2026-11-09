import { SidePanel, Status } from '@unitae/ui'
import { CalendarDays, FileText, Loader2, MoreHorizontal, Pencil, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { EventStatus } from '~/features/events/model/event-status.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { DiscardChangesDialog, UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'
import { ASSIGN_PART_FORM_ID, AssignPartEditor, assignPartCopy, type PersonOption } from './AssignPartEditor'
import { AssignPartSheet } from './AssignPartSheet'
import { ASSIGN_SERVICE_FORM_ID, AssignServiceEditor } from './AssignServiceEditor'
import { AssignServiceSheet } from './AssignServiceSheet'
import { type AssignedPart, EventAssignmentsPanel, type UnassignTarget } from './EventAssignmentsPanel'
import { type AssignedService, EventServiceAssignmentsPanel } from './EventServiceAssignmentsPanel'
import { UnassignConfirmDialog } from './UnassignConfirmDialog'
import { useCloseOnSave } from './use-close-on-save'
import { useSideEditor } from './use-side-editor'

interface EventViewProps {
  event: {
    id: number
    name: string
    status: string
    startDate: Date | string
    endDate: Date | string
    eventParts: AssignedPart[]
    eventServiceParts: AssignedService[]
  }
  /** Each action follows the right its route checks. */
  canEdit: boolean
  canPublish: boolean
  canAssign: boolean
  canAssignService: boolean
  canViewPublishers: boolean
  /** Everyone who may be picked, and per slot the ones eligible for it. */
  users: PersonOption[]
  partCandidates: Record<number, { speakerIds: number[]; readerIds: number[] }>
  serviceCandidates: Record<number, number[]>
  externalSpeakers: { id: number; name: string; congregationName: string }[]
  shareTexts: Record<number, string>
  timezone: string
}

/**
 * An event's programme for assigning people and adjusting a part for this week (subject, duration). Changing the
 * schedule itself happens on the edit page.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the page wires two panels, a docked or sheet editor and their guards
export function EventView({
  event,
  canEdit,
  canPublish,
  canAssign,
  canAssignService,
  canViewPublishers,
  users,
  partCandidates,
  serviceCandidates,
  externalSpeakers,
  shareTexts,
  timezone,
}: EventViewProps) {
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const [unassignTarget, setUnassignTarget] = useState<UnassignTarget | null>(null)
  const { blocker, setDirty } = useUnsavedChanges()

  const panel = useSideEditor<'part' | 'service'>(target =>
    target.kind === 'part'
      ? event.eventParts.some(part => part.id === target.id)
      : event.eventServiceParts.some(service => service.id === target.id),
  )
  const target = panel.target
  const part = target?.kind === 'part' ? event.eventParts.find(item => item.id === target.id) : undefined
  const service = target?.kind === 'service' ? event.eventServiceParts.find(item => item.id === target.id) : undefined

  useEffect(() => setDirty(panel.dirty), [panel.dirty, setDirty])
  useCloseOnSave(partFetcher, panel.close)
  useCloseOnSave(serviceFetcher, panel.close)

  const userById = new Map(users.map(user => [user.id, user]))
  const people = (ids: number[] | undefined) =>
    (ids ?? []).map(id => userById.get(id)).filter((user): user is PersonOption => user != null)
  const referenceYear = Number(
    new Intl.DateTimeFormat(getLocale(), { timeZone: timezone, year: 'numeric' }).format(new Date(event.startDate)),
  )
  const partEditor = {
    timeZone: timezone,
    referenceYear,
    speakerCandidates: people(part ? partCandidates[part.id]?.speakerIds : []),
    readerCandidates: people(part ? partCandidates[part.id]?.readerIds : []),
    externalSpeakers,
    eventId: event.id,
    fetcher: partFetcher,
  }
  const serviceEditor = {
    timeZone: timezone,
    referenceYear,
    candidates: people(service ? serviceCandidates[service.id] : []),
    eventId: event.id,
    fetcher: serviceFetcher,
  }

  const assignedParts = event.eventParts.filter(item => item.assigneeId ?? item.externalSpeakerId).length
  const filledServices = event.eventServiceParts.filter(item => item.assigneeId).length
  const date = formatEventDate(event.startDate, timezone, getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const times = `${formatEventTime(event.startDate, timezone)} – ${formatEventTime(event.endDate, timezone)}`
  const partCopy = part ? assignPartCopy(part) : null

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked editor can stick.
    <div data-sticky-content="">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        icon={CalendarDays}
        title={event.name}
        subtitle={`${date} · ${times}`}
        meta={
          <>
            {event.status === EventStatus.Draft ? (
              <Status tone="warning">{m.programs_event_draft_badge()}</Status>
            ) : (
              <Status tone="success">{m.programs_view_released()}</Status>
            )}
            <span>
              {(assignedParts < 2 ? m.programs_view_parts_assigned_one : m.programs_view_parts_assigned_many)({
                count: String(assignedParts),
                total: String(event.eventParts.length),
              })}
            </span>
            {event.eventServiceParts.length > 0 && (
              <span>
                {(filledServices < 2 ? m.programs_view_services_filled_one : m.programs_view_services_filled_many)({
                  count: String(filledServices),
                  total: String(event.eventServiceParts.length),
                })}
              </span>
            )}
          </>
        }
        breadcrumbs={[{ label: m.sidebar_programs(), to: '/programs' }, { label: event.name }]}
        actions={
          (canPublish || canEdit) && (
            <>
              {canPublish && <ReleaseToggleButton status={event.status} eventId={event.id} />}
              {canEdit && (
                <>
                  <Button variant="outline" asChild>
                    <Link to={`/programs/events/${event.id}/edit`}>
                      <Pencil />
                      {m.common_edit()}
                    </Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
                        <Link to={`/programs/events/${event.id}/delete`}>
                          <Trash2 />
                          {m.common_delete()}
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </>
          )
        }
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-6">
          <EventAssignmentsPanel
            parts={event.eventParts}
            canAssign={canAssign}
            canViewPublishers={canViewPublishers}
            shareTexts={shareTexts}
            selectedId={target?.kind === 'part' ? target.id : null}
            onAssign={(item, trigger) => panel.request({ kind: 'part', id: item.id, trigger })}
            onUnassign={setUnassignTarget}
          />
          <EventServiceAssignmentsPanel
            services={event.eventServiceParts}
            canAssign={canAssignService}
            canViewPublishers={canViewPublishers}
            selectedId={target?.kind === 'service' ? target.id : null}
            onAssign={(item, trigger) => panel.request({ kind: 'service', id: item.id, trigger })}
            onUnassign={setUnassignTarget}
          />
        </div>

        {panel.docked && target != null && (part != null || service != null) && (
          <SidePanel
            key={`${target.kind}-${target.id}`}
            title={part ? partCopy?.title : service?.name}
            description={partCopy?.description}
            closeLabel={m.common_close()}
            onClose={() => panel.request(null)}
            returnFocus={target.trigger}
            footer={
              <>
                <Button type="button" variant="ghost" onClick={panel.close}>
                  {m.common_cancel()}
                </Button>
                <SubmitButton
                  form={part ? ASSIGN_PART_FORM_ID : ASSIGN_SERVICE_FORM_ID}
                  disabled={(part ? partFetcher : serviceFetcher).state !== 'idle'}
                >
                  {m.common_save()}
                </SubmitButton>
              </>
            }
          >
            {part ? (
              <AssignPartEditor key={part.id} part={part} {...partEditor} formRef={panel.formRef} />
            ) : (
              service && (
                <AssignServiceEditor key={service.id} service={service} {...serviceEditor} formRef={panel.formRef} />
              )
            )}
          </SidePanel>
        )}
      </div>

      {!panel.docked && (
        <>
          <AssignPartSheet
            open={part != null}
            onOpenChange={next => !next && panel.close()}
            part={part ?? null}
            {...partEditor}
          />
          <AssignServiceSheet
            open={service != null}
            onOpenChange={next => !next && panel.close()}
            service={service ?? null}
            {...serviceEditor}
          />
        </>
      )}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />

      <UnassignConfirmDialog
        open={unassignTarget != null}
        onOpenChange={next => {
          if (!next) setUnassignTarget(null)
        }}
        target={unassignTarget}
        eventId={event.id}
      />
    </div>
  )
}

function ReleaseToggleButton({ status, eventId }: { status: string; eventId: number }) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const isDraft = status === EventStatus.Draft
  const action = isDraft ? `/programs/events/${eventId}/release` : `/programs/events/${eventId}/unrelease`
  const label = isDraft ? m.programs_event_release_button() : m.programs_event_unrelease_button()
  const Icon = isDraft ? Send : FileText
  const inFlight = fetcher.state !== 'idle'

  return (
    <Button
      variant={isDraft ? 'default' : 'outline'}
      onClick={() => fetcher.submit({}, { method: 'POST', action })}
      disabled={inFlight}
    >
      {inFlight ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </Button>
  )
}
