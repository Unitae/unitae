import { redirect } from 'react-router'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { EventEditor } from '~/features/events/ui/EventEditor'
import * as m from '~/i18n/paraglide/messages'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/schedule-edit'
import { action as editAction, loader as editLoader } from './edit'

export const meta: Route.MetaFunction = () => [{ title: m.programs_schedule_edit() }]

/**
 * « Modifier le planning » (D38): one schedule's structure on its own page, the event's editor narrowed to it. Its
 * guard is the editor's (changing the event), and filling this schedule: whoever may not lands on the event page.
 */
export async function loader(args: Route.LoaderArgs) {
  const scheduleId = requireParamId(args.params.scheduleId, '/programs')
  const data = await editLoader(args as never)
  const schedule = data.event.schedules.find(candidate => candidate.id === scheduleId)
  const isProgramme = schedule?.kind === ScheduleKind.Programme
  if (schedule == null || !(isProgramme ? data.canFillParts : data.canFillServices)) {
    throw redirect(`/programs/events/${data.event.id}`)
  }
  return { ...data, focus: { id: schedule.id, kind: schedule.kind as ScheduleKind, name: schedule.name } }
}

/** The editor's intents, each still asking the right of the schedule it fills. */
export const action = editAction as unknown as (args: Route.ActionArgs) => ReturnType<typeof editAction>

export default function ScheduleEditPage({ loaderData }: Route.ComponentProps) {
  return <EventEditor {...loaderData} />
}
