import { Status, Tag } from '@unitae/ui'
import { FileText, Loader2, Send } from 'lucide-react'
import { useFetcher } from 'react-router'
import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { formatPersonName } from '~/shared/utils/format-person-name'

/** A schedule as its section on the event page shows it (D37, D43, D45: the reader sees only those they may). */
export interface EventScheduleView {
  id: number
  kind: string
  status: string
  name: string | null
  key: string | null
  responsible: {
    role: { key: string; name: string | null }
    holders: {
      memberId: number | null
      accountId: number | null
      firstname: string | null
      lastname: string | null
      seat: 'leader' | 'deputy' | 'member'
    }[]
  } | null
  /** « Publier les programmes », or the responsible of its template (D8). */
  mayPublish: boolean
}

type ScheduleHolder = NonNullable<EventScheduleView['responsible']>['holders'][number]

export interface ScheduleViewer {
  accountId: number
  memberId: number | null
}

/** Its own name, or the catalogue's for one made without a template. */
export function scheduleTitle(schedule: EventScheduleView): string {
  if (schedule.name) return schedule.name
  return schedule.kind === ScheduleKind.Programme ? m.programs_view_spiritual_program() : m.programs_view_services()
}

/** The section's title: its name and its kind. */
export function ScheduleTitle({ schedule }: { schedule: EventScheduleView }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {scheduleTitle(schedule)}
      <Tag>
        {schedule.kind === ScheduleKind.Programme
          ? m.programs_schedule_kind_programme()
          : m.programs_schedule_kind_duty()}
      </Tag>
    </span>
  )
}

const SHOWN_HOLDERS = 4

/**
 * Who answers for the schedule (D37): the role, then its titulaire, then its adjoints; its other holders after them,
 * a few at most. A schedule without a responsible is the managers' (D47).
 */
export function ScheduleResponsibleLine({ schedule, viewer }: { schedule: EventScheduleView; viewer: ScheduleViewer }) {
  const { responsible } = schedule
  if (responsible == null) {
    return <p className="px-4.5 py-2.5 text-muted-foreground text-sm">{m.programs_schedule_no_one_in_charge()}</p>
  }
  const seated = responsible.holders.filter(holder => holder.seat !== 'member')
  const shown = (seated.length > 0 ? seated : responsible.holders).slice(0, SHOWN_HOLDERS)
  const isViewer = (holder: ScheduleHolder) =>
    (holder.memberId != null && holder.memberId === viewer.memberId) || holder.accountId === viewer.accountId
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4.5 py-2.5 text-muted-foreground text-sm">
      <span>{m.programs_schedule_in_charge()} :</span>
      <span className="font-medium text-foreground">{getRoleDisplayName(responsible.role)}</span>
      {shown.map(holder => (
        <span key={`${holder.memberId ?? 'a'}-${holder.accountId ?? 'm'}`} className="inline-flex items-center gap-1">
          <span aria-hidden="true">·</span>
          <span className="text-foreground">{formatPersonName(holder)}</span>
          {holder.seat === 'leader' && <span>{m.org_seat_leader_personal().toLowerCase()}</span>}
          {holder.seat === 'deputy' && <span>{m.org_seat_deputy().toLowerCase()}</span>}
          {isViewer(holder) && <span className="font-medium text-brand-text">{m.programs_schedule_you()}</span>}
        </span>
      ))}
    </p>
  )
}

/** Its status and how full it is, and its own « Publier » or « Repasser en brouillon » for whoever may (D8). */
export function ScheduleStatusControl({
  eventId,
  schedule,
  fill,
}: {
  eventId: number
  schedule: EventScheduleView
  fill: string | null
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const published = schedule.status === ScheduleStatus.Published
  const action = `/programs/events/${eventId}/schedules/${schedule.id}/${published ? 'unpublish' : 'publish'}`
  const inFlight = fetcher.state !== 'idle'
  const Icon = published ? FileText : Send
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Status tone={published ? 'success' : 'warning'}>
        {published ? m.programs_view_released() : m.programs_event_draft_badge()}
        {fill && ` · ${fill}`}
      </Status>
      {schedule.mayPublish && (
        <Button
          size="sm"
          // 44 px to the touch on a phone.
          className="max-md:h-11"
          variant={published ? 'ghost' : 'default'}
          disabled={inFlight}
          onClick={() => fetcher.submit({}, { method: 'POST', action })}
        >
          {inFlight ? <Loader2 className="animate-spin" /> : <Icon />}
          {published ? m.programs_event_unrelease_button() : m.programs_event_release_button()}
        </Button>
      )}
    </span>
  )
}
