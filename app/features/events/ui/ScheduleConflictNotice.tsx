import { Callout } from '@unitae/ui'
import { ScheduleStatus } from '~/features/events/model/schedule.type'
import * as m from '~/i18n/paraglide/messages'
import { formatPersonName } from '~/shared/utils/format-person-name'
import type { PersonName } from './PersonCell'
import type { EventScheduleView } from './ScheduleHeading'

/**
 * « Pas encore publiable » (design round A, dialog 4): a draft whose people include someone away that day says so in
 * its section, with who and on what, before anyone clicks « Publier »; that schedule alone is held back.
 */
export function ScheduleConflictNotice({
  schedule,
  items,
}: {
  schedule: EventScheduleView
  items: { name: string; assignee: PersonName | null; hasConflict: boolean }[]
}) {
  if (schedule.status !== ScheduleStatus.Draft || !schedule.mayPublish) return null
  const away = items.filter(item => item.hasConflict && item.assignee != null)
  if (away.length === 0) return null
  const who = away.map(item => `${formatPersonName(item.assignee as PersonName)} (${item.name})`).join(', ')
  return (
    <div className="px-4.5 pt-3">
      <Callout tone="danger" role="alert" title={m.programs_schedule_conflict_title()}>
        {m.programs_schedule_conflict_body({ count: away.length, who })}
      </Callout>
    </div>
  )
}
