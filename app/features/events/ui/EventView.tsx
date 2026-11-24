import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import type { ExternalSpeakerOption } from '~/features/events/model/external-speaker.type'
import { parseAssignKey } from '~/features/events/model/reassign'
import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useOpenParam } from '~/shared/ui/hooks/use-open-param'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { DiscardChangesDialog, UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate, formatEventTime } from '~/shared/utils/event-time'
import type { PersonOption } from './AssignPartEditor'
import { DeleteEventDialog } from './DeleteEventDialog'
import { type AssignedPart, EventAssignmentsPanel, type UnassignTarget } from './EventAssignmentsPanel'
import { EventHeader } from './EventHeader'
import { EventItemEditor } from './EventItemEditor'
import { type AssignedService, EventServiceAssignmentsPanel } from './EventServiceAssignmentsPanel'
import { ScheduleActions } from './ScheduleActions'
import type { ScheduleAddOptions } from './ScheduleAddMenu'
import {
  type EventScheduleView,
  ScheduleResponsibleLine,
  ScheduleStatusControl,
  ScheduleTitle,
  scheduleTitle,
} from './ScheduleHeading'
import { UnassignConfirmDialog } from './UnassignConfirmDialog'

interface EventViewProps {
  event: {
    id: number
    name: string
    status: string
    startDate: Date | string
    endDate: Date | string
    eventParts: AssignedPart[]
    eventServiceParts: AssignedService[]
    /** The schedules this reader may see: the others never reach the page (maySeeSchedule, D45). */
    schedules: EventScheduleView[]
  }
  /** A meeting created ahead with no programme yet: « Créer le programme » replaces publishing it. */
  awaitingProgramme: boolean
  /** The meeting has counts: deleting it removes only its programme. */
  hasAttendance: boolean
  /** Each action follows the right its route checks. */
  canEdit: boolean
  /** Delete the event: « Gérer », or its kind's responsible when it holds schedules and every one is theirs (D50). */
  canDelete: boolean
  /** Give an empty meeting its programme: whoever may change it, as creating an event of its kind (D28). */
  canCreateProgramme: boolean
  /** « Publier » / « Retirer » on an event holding no schedule (D46); with schedules, see publishAll. */
  canRelease: boolean
  canUnrelease: boolean
  canAssign: boolean
  canAssignService: boolean
  canViewPublishers: boolean
  /** Everyone who may be picked, and per slot the ones eligible for it. */
  users: PersonOption[]
  partCandidates: Record<number, { speakerIds: number[]; readerIds: number[] }>
  serviceCandidates: Record<number, number[]>
  externalSpeakers: ExternalSpeakerOption[]
  shareTexts: Record<number, string>
  timezone: string
  /** « Tout publier » (D43): how many drafts the reader may publish, and whether that is every schedule (« Publier »). */
  publishAll: { count: number; everyone: boolean }
  /** « Ajouter un planning » (D39): what the reader may add of a kind the event lacks. */
  addSchedule: { options: ScheduleAddOptions; eventKindName: string | null }
}

/**
 * An event's programme for assigning people and adjusting a part for this week (subject, duration). Changing the
 * schedule itself happens on the edit page.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the page wires two panels, a docked or sheet editor and their guards
export function EventView({
  event,
  awaitingProgramme,
  hasAttendance,
  canEdit,
  canDelete,
  canCreateProgramme,
  canRelease,
  canUnrelease,
  canAssign,
  canAssignService,
  canViewPublishers,
  users,
  partCandidates,
  serviceCandidates,
  externalSpeakers,
  shareTexts,
  timezone,
  publishAll,
  addSchedule,
}: EventViewProps) {
  const partFetcher = useFetcher()
  const serviceFetcher = useFetcher()
  const [unassignTarget, setUnassignTarget] = useState<UnassignTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { blocker, setDirty } = useUnsavedChanges()

  const panel = useSideEditor<'part' | 'service'>(target =>
    target.kind === 'part'
      ? event.eventParts.some(part => part.id === target.id)
      : event.eventServiceParts.some(service => service.id === target.id),
  )
  const target = panel.target
  const part = target?.kind === 'part' ? event.eventParts.find(item => item.id === target.id) : undefined
  const service = target?.kind === 'service' ? event.eventServiceParts.find(item => item.id === target.id) : undefined
  // ↑ ↓ walk the parts, or the services, in the programme's order.
  const walk = part
    ? panel.walk(
        'part',
        event.eventParts.map(item => item.id),
      )
    : panel.walk(
        'service',
        event.eventServiceParts.map(item => item.id),
      )

  // `?item=part-12` opens that item's panel: the absences page links here to reassign a part someone is away for. It
  // was `?assign=` with the old rows' ids (plan T12); such a link now opens the event alone, never another slot.
  useOpenParam('item', value => {
    const slot = parseAssignKey(value)
    if (slot != null && (slot.kind === 'part' ? canAssign : canAssignService)) panel.open({ ...slot, trigger: null })
  })
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

  // A block for each schedule the reader sees, and the programme while it waits to be created: nothing on the page
  // tells of a schedule hidden from them (D45).
  const shownKinds = new Set(event.schedules.map(schedule => schedule.kind))
  const showsProgramme = awaitingProgramme || shownKinds.has(ScheduleKind.Programme)
  const showsDuties = shownKinds.has(ScheduleKind.Duty)
  // Each schedule its own section: its title and kind, its responsible (D37), its status and its « Publier ». By
  // kind, while an event holds one schedule of each (see maySeeSchedule): its items carry no schedule of their own.
  const programmeSchedule = event.schedules.find(schedule => schedule.kind === ScheduleKind.Programme)
  const dutySchedule = event.schedules.find(schedule => schedule.kind === ScheduleKind.Duty)
  const headingOf = (schedule: EventScheduleView | undefined, fill: string, assignments: number) =>
    schedule && {
      title: <ScheduleTitle schedule={schedule} />,
      actions: (
        <>
          <ScheduleStatusControl eventId={event.id} schedule={schedule} fill={fill} />
          {schedule.mayChange && (
            <ScheduleActions
              eventId={event.id}
              schedule={{
                id: schedule.id,
                title: scheduleTitle(schedule),
                published: schedule.status === ScheduleStatus.Published,
              }}
              assignments={assignments}
            />
          )}
        </>
      ),
      intro: <ScheduleResponsibleLine schedule={schedule} />,
    }
  const bySchedule = event.schedules.length > 0
  const assignedParts = event.eventParts.filter(item => item.assigneeId ?? item.externalSpeakerId).length
  const filledServices = event.eventServiceParts.filter(item => item.assigneeId).length
  const date = formatEventDate(event.startDate, timezone, getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const times = `${formatEventTime(event.startDate, timezone)} – ${formatEventTime(event.endDate, timezone)}`

  return (
    // The marker lets the app shell stop clipping as a scroll container, so the docked editor can stick.
    <div data-sticky-content="">
      <UnsavedChangesDialog blocker={blocker} />
      <EventHeader
        event={{ id: event.id, name: event.name, status: event.status }}
        subtitle={`${date} · ${times}`}
        awaitingProgramme={awaitingProgramme}
        // With schedules, each section carries its status and its « Publier »; the header publishes them all (D43).
        publishAll={bySchedule ? publishAll : null}
        addSchedule={addSchedule}
        canRelease={canRelease}
        canUnrelease={canUnrelease}
        canEdit={canEdit}
        canCreateProgramme={canCreateProgramme}
        // An empty meeting with counts has nothing left to delete: the meeting and its attendance stay.
        canDelete={canDelete && !(awaitingProgramme && hasAttendance)}
        onDelete={() => setDeleting(true)}
      />

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-6">
          {showsProgramme && (
            <EventAssignmentsPanel
              parts={event.eventParts}
              canAssign={canAssign}
              canViewPublishers={canViewPublishers}
              shareTexts={shareTexts}
              selectedId={target?.kind === 'part' ? target.id : null}
              onAssign={(item, trigger) => panel.request({ kind: 'part', id: item.id, trigger })}
              onUnassign={setUnassignTarget}
              emptyHint={awaitingProgramme ? m.programs_awaiting_hint() : undefined}
              heading={headingOf(
                programmeSchedule,
                m.programs_view_parts_assigned({ count: assignedParts, total: event.eventParts.length }),
                event.eventParts.filter(item => item.assigneeId != null).length +
                  event.eventParts.filter(item => item.assistantId != null).length,
              )}
            />
          )}
          {showsDuties && (
            <EventServiceAssignmentsPanel
              services={event.eventServiceParts}
              canAssign={canAssignService}
              canViewPublishers={canViewPublishers}
              selectedId={target?.kind === 'service' ? target.id : null}
              onAssign={(item, trigger) => panel.request({ kind: 'service', id: item.id, trigger })}
              onUnassign={setUnassignTarget}
              heading={headingOf(
                dutySchedule,
                m.programs_view_services_filled({ count: filledServices, total: event.eventServiceParts.length }),
                filledServices,
              )}
            />
          )}
        </div>

        <EventItemEditor
          panel={panel}
          part={part}
          service={service}
          walk={walk}
          partEditor={partEditor}
          serviceEditor={serviceEditor}
        />
      </div>

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
      {canDelete && (
        <DeleteEventDialog
          event={{ id: event.id, name: event.name, date }}
          outcome={hasAttendance ? 'programme-only' : awaitingProgramme ? 'empty-meeting' : 'everything'}
          open={deleting}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  )
}
