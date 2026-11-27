import { redirect } from 'react-router'
import { ScheduleKind } from '~/features/events/model/schedule.type'
import { EventEditor } from '~/features/events/ui/EventEditor'
import * as m from '~/i18n/paraglide/messages'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/schedule-edit'
import { action as editAction, loader as editLoader } from './edit'

export const meta: Route.MetaFunction = () => [{ title: m.programs_schedule_edit_meta_title() }]

/**
 * « Modifier le planning » (D38): one schedule's structure on its own page, the event's editor narrowed to it. The
 * editor's guard comes first (changing the event, else the programmes list); then filling this schedule, else the event
 * page, as for a schedule that is not the event's.
 */
export async function loader(args: Route.LoaderArgs) {
  const scheduleId = requireParamId(args.params.scheduleId, '/programs')
  const data = await editLoader(args as never)
  const schedule = data.event.schedules.find(candidate => candidate.id === scheduleId)
  const isProgramme = schedule?.kind === ScheduleKind.Programme
  // A duties schedule is its own responsible's (a meeting may hold several): that one's right, not the kind's.
  const fills = schedule != null && (isProgramme ? data.canFillParts : data.fillableSchedules.includes(schedule.id))
  if (schedule == null || !fills) throw redirect(`/programs/events/${data.event.id}`)
  return {
    ...data,
    canFillServices: !isProgramme || data.canFillServices,
    focus: { id: schedule.id, kind: schedule.kind as ScheduleKind, name: schedule.name },
  }
}

/** The editor's own action: changing the event, then the right of the schedule each intent fills. */
export function action(args: Route.ActionArgs) {
  return editAction(args as never)
}
export default function ScheduleEditPage({ loaderData }: Route.ComponentProps) {
  return <EventEditor {...loaderData} />
}
