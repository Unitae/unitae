import { Callout } from '@unitae/ui'
import { conflictedParts } from '~/features/events/model/conflicted-parts'
import * as m from '~/i18n/paraglide/messages'
import type { EventScheduleView } from './ScheduleHeading'

/**
 * « Pas encore publiable » (design round A, dialog 4): a draft holding someone away that day says so in its section,
 * naming the parts, before anyone clicks « Publier »; that schedule alone is held back.
 */
export function ScheduleConflictNotice({
  schedule,
  items,
}: {
  schedule: EventScheduleView
  items: { name: string; hasConflict: boolean }[]
}) {
  const parts = conflictedParts(schedule, items)
  if (parts.length === 0) return null
  return (
    <div className="px-4.5 pt-3">
      <Callout tone="danger" title={m.programs_schedule_conflict_title()}>
        {m.programs_schedule_conflict_body({ count: parts.length, parts: parts.join(', ') })}
      </Callout>
    </div>
  )
}
