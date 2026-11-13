import { Panel, Status } from '@unitae/ui'
import { CalendarOff } from 'lucide-react'
import { Link } from 'react-router'

import type { MemberAbsence } from '~/features/events'
import type { RecordAssignment } from '~/features/publishers/model/record-engagements'
import { TerritoryKindKey } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { DateChip } from '~/shared/ui/DateChip'
import { dayOf, daysBetween } from '~/shared/utils/calendar-day'
import { formatEventDate } from '~/shared/utils/event-time'

const ROW = 'flex min-h-14 items-center gap-3 border-border border-t px-4.5 py-2 first:border-t-0'
const LINK_ROW = `${ROW} transition-colors duration-(--u-duration-fast) hover:bg-hover`

function shortDay(date: Date | string, timeZone: string) {
  return formatEventDate(date, timeZone, getLocale(), { weekday: 'short', day: 'numeric', month: 'long' })
}

/** The person's upcoming programme: their parts and service slots, then their planned absences. */
export function RecordProgramme({
  assignments,
  absences,
  timeZone,
}: {
  assignments: RecordAssignment[]
  /** Null when the reader may not see absences. */
  absences: MemberAbsence[] | null
  timeZone: string
}) {
  const count = assignments.length
  return (
    <Panel
      title={m.publishers_record_programme()}
      actions={
        <>
          {count > 0 && (
            <span className="text-faint text-sm tabular-nums">{m.publishers_record_assignments({ count })}</span>
          )}
          <Link to="/programs" className="text-brand-text text-sm hover:underline">
            {m.publishers_record_see_programs()}
          </Link>
        </>
      }
    >
      {count === 0 && <p className="px-4.5 py-3 text-faint text-sm">{m.publishers_view_no_upcoming_assignments()}</p>}
      {assignments.map(assignment => (
        <Link key={assignment.key} to={`/programs/events/${assignment.eventId}/view`} className={LINK_ROW}>
          <DateChip date={assignment.eventStartDate} timeZone={timeZone} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{assignment.partName}</span>
            <span className="truncate text-faint text-xs">
              {assignment.eventName} · {shortDay(assignment.eventStartDate, timeZone)}
              {assignment.service && ` · ${m.publishers_record_service_slot()}`}
            </span>
          </span>
          {assignment.absent && <Status tone="warning">{m.publishers_record_absent_that_day()}</Status>}
        </Link>
      ))}
      {absences != null && absences.length > 0 && (
        <>
          <div className="border-border border-t px-4.5 pt-2.5 pb-1 font-medium text-faint text-xs">
            {m.publishers_record_planned_absences()}
          </div>
          {absences.map(absence => (
            <AbsenceRow key={absence.id} absence={absence} timeZone={timeZone} />
          ))}
        </>
      )}
    </Panel>
  )
}

function AbsenceRow({ absence, timeZone }: { absence: MemberAbsence; timeZone: string }) {
  if (absence.startDate == null || absence.endDate == null) return null
  const days = daysBetween(dayOf(absence.startDate, timeZone), dayOf(absence.endDate, timeZone)) + 1
  return (
    <div className={`${ROW} min-h-12 first:border-t-0`}>
      <CalendarOff className="size-4 text-faint" aria-hidden="true" />
      <span className="text-sm">
        {shortDay(absence.startDate, timeZone)} – {shortDay(absence.endDate, timeZone)}
        <span className="text-faint tabular-nums">
          {' · '}
          {m.publishers_record_days({ count: days })}
        </span>
      </span>
    </div>
  )
}

export interface RecordTerritory {
  id: number
  territoryId: number
  number: string
  type: string
  startDate: Date
  lateDate: Date | null
  pausedAt: Date | null
}

const KIND_LABEL: Record<string, () => string> = {
  [TerritoryKindKey.Classical]: m.publishers_view_territory_classical,
  [TerritoryKindKey.Commerces]: m.publishers_view_territory_commerces,
  [TerritoryKindKey.Phone]: m.publishers_view_territory_phone,
  [TerritoryKindKey.Hotel]: m.publishers_view_territory_hotel,
  [TerritoryKindKey.Univ]: m.publishers_view_territory_univ,
}

/** The territories the person holds, each with when it went out and when it is due, as « Mes territoires » says it. */
export function RecordTerritories({
  territories,
  canOpen,
  timeZone,
  now,
}: {
  territories: RecordTerritory[]
  /** The reader may open a territory's page. */
  canOpen: boolean
  timeZone: string
  now: Date
}) {
  const count = territories.length
  return (
    <Panel
      title={m.publishers_record_territories()}
      actions={
        count > 0 && (
          <span className="text-faint text-sm tabular-nums">{m.publishers_record_territories_count({ count })}</span>
        )
      }
    >
      {count === 0 && <p className="px-4.5 py-3 text-faint text-sm">{m.publishers_view_no_attributions()}</p>}
      {territories.map(territory => {
        const body = (
          <>
            <span className="w-11 font-semibold text-base tabular-nums">{territory.number}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{KIND_LABEL[territory.type]?.() ?? territory.type}</span>
              <span className="text-faint text-xs">
                {m.publishers_record_out_since({ date: longDay(territory.startDate, timeZone) })}
              </span>
            </span>
            <TerritoryDue territory={territory} timeZone={timeZone} now={now} />
          </>
        )
        return canOpen ? (
          <Link key={territory.id} to={`/territories/territory/${territory.territoryId}/view`} className={LINK_ROW}>
            {body}
          </Link>
        ) : (
          <div key={territory.id} className={ROW}>
            {body}
          </div>
        )
      })}
    </Panel>
  )
}

function longDay(date: Date, timeZone: string) {
  return formatEventDate(date, timeZone, getLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
}

function TerritoryDue({ territory, timeZone, now }: { territory: RecordTerritory; timeZone: string; now: Date }) {
  if (territory.pausedAt != null) {
    return (
      <Status tone="neutral">{m.my_territories_paused_since({ date: longDay(territory.pausedAt, timeZone) })}</Status>
    )
  }
  if (territory.lateDate == null || territory.lateDate < now) {
    return (
      <Status tone="warning">
        {territory.lateDate
          ? m.my_territories_overdue_since({ date: longDay(territory.lateDate, timeZone) })
          : m.attributions_status_late()}
      </Status>
    )
  }
  return <Status tone="neutral">{m.my_territories_due_on({ date: longDay(territory.lateDate, timeZone) })}</Status>
}
