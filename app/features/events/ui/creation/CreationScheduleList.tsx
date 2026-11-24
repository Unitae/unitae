import type { CreationSchedule } from '~/features/events/model/programme-creation'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'
import { scheduleTitle } from '../ScheduleHeading'
import { scheduleContent } from './creation-labels'

/**
 * The schedules a new meeting of a kind arrives with, read only (the user's choice: no checkbox, no responsible). A
 * kind suggesting none says so: the meeting's page offers « Ajouter un planning » afterwards.
 */
export function CreationScheduleList({
  schedules,
  typeName,
  className,
}: {
  schedules: CreationSchedule[]
  /** The kind's name: a schedule named like it reads as its kind (« Programme spirituel »), not the name twice. */
  typeName: string
  className?: string
}) {
  if (schedules.length === 0) {
    return <p className={cn('px-3 py-2 text-faint text-sm', className)}>{m.programs_new_no_schedule()}</p>
  }
  return (
    <ul aria-label={m.programs_new_schedules_title()} className={className}>
      {schedules.map(schedule => (
        // One schedule of each kind on a meeting (until PR 6/7): kind and name tell them apart.
        <li key={`${schedule.kind}-${schedule.name ?? ''}`} className="flex flex-col px-3 py-1.5 text-sm">
          <span>{scheduleTitle(schedule.name === typeName ? { ...schedule, name: null } : schedule)}</span>
          <span className="text-faint text-xs tabular-nums">{scheduleContent(schedule)}</span>
        </li>
      ))}
    </ul>
  )
}
