import { data, redirect } from 'react-router'
import { attendanceRights } from '~/features/events/model/attendance-access'
import { attendanceRecordSchema } from '~/features/events/schemas/attendance-record.schema'
import { recordAttendance } from '~/features/events/server/record-attendance.server'
import { congregationContext, currentAccountContext, permissionsContext } from '~/shared/auth/route-context.server'

import type { Route } from './+types/record'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/attendance')
}

/**
 * Saves the counts typed on the attendance card, from the dashboard or the attendance page. Answers what became of
 * each count, which the card shows beside its field: one refused never undoes the other.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const rights = attendanceRights(context.get(permissionsContext))
  if (!(rights.canRecord || rights.canCorrect)) return data({ ok: false as const }, { status: 403 })
  const payload = attendanceRecordSchema.safeParse(await request.json().catch(() => null))
  if (!payload.success) return data({ ok: false as const }, { status: 400 })

  const { eventId, ...counts } = payload.data
  const outcomes = await recordAttendance(eventId, counts, {
    congregationId: context.get(currentAccountContext).congregationId,
    actorId: context.get(currentAccountContext).id,
    ...rights,
    timeZone: context.get(congregationContext).timezone,
    now: new Date(),
  })
  return { ok: true as const, outcomes }
}
