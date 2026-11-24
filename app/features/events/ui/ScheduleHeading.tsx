import { Status, Tag } from '@unitae/ui'
import { FileText, Loader2, Send } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { schedulePublishAction } from '~/features/events/model/programme-access'
import { ScheduleKind, ScheduleStatus } from '~/features/events/model/schedule.type'
import type { PageResponsible } from '~/features/events/model/schedule-responsible'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'
import { PublishUnfilledDialog } from './PublishUnfilledDialog'

/** A schedule as its section on the event page shows it (D37, D43, D45: the reader sees only those they may). */
export interface EventScheduleView {
  id: number
  kind: string
  status: string
  name: string | null
  /** Who answers for it, as its section names them; null for a schedule without one (D47). */
  responsible: PageResponsible | null
  /** « Publier les programmes », or the responsible of its template (D8): may publish or withdraw it. */
  mayPublish: boolean
  /** A draft they may publish that publishing would not refuse (a programme still to give is): « Publier » shows. */
  publishable: boolean
  /** Rename it for this meeting or delete it: « Gérer », or the responsible of its template. */
  mayChange: boolean
}

/** Its own name, or the catalogue's for one left unnamed (« Programme », « Services »). */
export function scheduleTitle(schedule: { name: string | null; kind: string }): string {
  if (schedule.name) return schedule.name
  return schedule.kind === ScheduleKind.Programme ? m.programs_view_spiritual_program() : m.programs_view_services()
}

/** A schedule kind's label: « Spirituel » or « Services ». */
export function scheduleKindLabel(kind: string): string {
  return kind === ScheduleKind.Programme ? m.programs_schedule_kind_programme() : m.programs_schedule_kind_duty()
}

/** The section's title: its name, and its kind unless the name already says it (« Services », the user's choice). */
export function ScheduleTitle({ schedule }: { schedule: EventScheduleView }) {
  const title = scheduleTitle(schedule)
  const kind = scheduleKindLabel(schedule.kind)
  return (
    <span className="flex flex-wrap items-center gap-2">
      {title}
      {kind !== title && <Tag>{kind}</Tag>}
    </span>
  )
}

/**
 * Who answers for the schedule (D37): the role, then those its section names (the titulaire and the adjoints, the
 * other holders when there is neither), « vous » for the reader, or after them when the reader holds the role unnamed.
 * A schedule without a responsible shows no line: it is the managers' (D47).
 */
export function ScheduleResponsibleLine({ schedule }: { schedule: EventScheduleView }) {
  const { responsible } = schedule
  // Without one, the section says nothing (the user's choice): the managers see to it (D47).
  if (responsible == null) return null
  const named = responsible.holders.some(holder => holder.you)
  // Each part ends with its separator, so a wrapped line on a phone never starts with « · ».
  const parts: { key: string; content: ReactNode }[] = [
    {
      key: 'role',
      content: (
        <>
          <span>{m.programs_schedule_in_charge()}</span>
          <span className="font-medium text-foreground">{getRoleDisplayName(responsible.role)}</span>
        </>
      ),
    },
    ...responsible.holders.map(holder => ({
      key: holder.key,
      content: (
        <>
          <span className="text-foreground">{formatPersonName(holder)}</span>
          {holder.seat === 'leader' && <span>{m.org_seat_leader_personal().toLowerCase()}</span>}
          {holder.seat === 'deputy' && <span>{m.org_seat_deputy().toLowerCase()}</span>}
          {holder.you && <span className="font-medium text-brand-text">{m.programs_schedule_you()}</span>}
        </>
      ),
    })),
    ...(responsible.youHoldIt && !named
      ? [{ key: 'you', content: <span className="font-medium text-brand-text">{m.programs_schedule_you()}</span> }]
      : []),
  ]
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {parts.map((part, index) => (
        <span key={part.key} className="inline-flex items-center gap-1">
          {part.content}
          {index < parts.length - 1 && <span aria-hidden="true">·</span>}
        </span>
      ))}
    </span>
  )
}

/** A schedule's status and how full it is. */
export function ScheduleStatusBadge({ schedule, fill }: { schedule: EventScheduleView; fill: string | null }) {
  const published = schedule.status === ScheduleStatus.Published
  return (
    <Status tone={published ? 'success' : 'warning'}>
      {published ? m.programs_view_released() : m.programs_event_draft_badge()}
      {fill && ` · ${fill}`}
    </Status>
  )
}

/**
 * A panel whose description holds only a part marked `data-phone-only` hides that line from md up, so its desktop
 * header keeps one line. It reaches into Panel's markup (@unitae/ui: the description is the `div` right after the
 * title's `h2`): if Panel's header changes shape, recheck it, or give Panel a class for its description.
 */
export const PHONE_ONLY_DESCRIPTION = 'md:[&_h2+div:has(>[data-phone-only]:only-child)]:hidden'

/** Its status and how full it is, and its own « Publier » or « Repasser en brouillon » for whoever may (D8). */
export function ScheduleStatusControl({
  eventId,
  schedule,
  fill,
  unfilled,
  placement = 'header',
}: {
  eventId: number
  schedule: EventScheduleView
  fill: string | null
  /** Its slots nobody holds: publishing asks first when there are some. */
  unfilled: number
  /**
   * `header`: the status, and the button from md up; `foot`: the button alone, on a phone, below the section's rows
   * (the user's choice for the phone: no fold, the actions at the foot).
   */
  placement?: 'header' | 'foot'
}) {
  const fetcher = useFetcher<{ ok: boolean }>()
  const [asking, setAsking] = useState(false)
  const published = schedule.status === ScheduleStatus.Published
  const action = `/programs/events/${eventId}/schedules/${schedule.id}/${published ? 'unpublish' : 'publish'}`
  const inFlight = fetcher.state !== 'idle'
  const submit = () => fetcher.submit({}, { method: 'POST', action })
  const Icon = published ? FileText : Send
  return (
    <span className={cn('flex flex-wrap items-center gap-2', placement === 'foot' && 'md:hidden')}>
      {/* On a phone the status reads under the title (ScheduleStatusBadge in the description). */}
      {placement === 'header' && (
        <span className="max-md:hidden">
          <ScheduleStatusBadge schedule={schedule} fill={fill} />
        </span>
      )}
      {schedulePublishAction(schedule) != null && (
        <Button
          size="sm"
          // 44 px to the touch on a phone, where it sits at the section's foot.
          className={cn('max-md:h-11', placement === 'header' && 'max-md:hidden')}
          variant={published ? 'ghost' : 'default'}
          disabled={inFlight}
          onClick={() => (!published && unfilled > 0 ? setAsking(true) : submit())}
        >
          {inFlight ? <Loader2 className="animate-spin" /> : <Icon />}
          {published ? m.programs_event_unrelease_button() : m.programs_event_release_button()}
        </Button>
      )}
      <PublishUnfilledDialog
        open={asking}
        unfilled={unfilled}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false)
          submit()
        }}
      />
    </span>
  )
}
