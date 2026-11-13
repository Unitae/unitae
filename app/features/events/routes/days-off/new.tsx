import { parseWithZod } from '@conform-to/zod/v4'
import { useCallback } from 'react'
import { data, redirect, useNavigate } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/index.server'
import { absenceWindow } from '~/features/events/model/absence'
import { dayOffSchema } from '~/features/events/schemas/day-off.schema'
import { createDayOff } from '~/features/events/server/days-off.server'
import { listUserConflictsInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import { AbsenceForm } from '~/features/events/ui/AbsenceForm'
import { DayOffConflictModal } from '~/features/events/ui/DayOffConflictModal'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { dayOf } from '~/shared/utils/calendar-day'

import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const { timezone } = context.get(congregationContext)
  return { timeZone: timezone, today: dayOf(new Date(), timezone) }
}

export default function NewDayOffPage({ loaderData, actionData }: Route.ComponentProps) {
  const { blocker, setDirty } = useUnsavedChanges()
  const onDirtyChange = useCallback((dirty: boolean) => setDirty(dirty), [setDirty])
  const navigate = useNavigate()
  // Saved with assignments falling during it: the dialog is the confirmation.
  const conflicts = actionData != null && 'conflicts' in actionData ? actionData.conflicts : null
  const lastResult = actionData != null && !('conflicts' in actionData) ? actionData : undefined

  return (
    <>
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        // The words of the button that led here.
        title={m.days_off_new_button()}
        breadcrumbs={[{ label: m.sidebar_my_absences(), to: '/me/days-off' }, { label: m.days_off_new_button() }]}
      />
      <AbsenceForm
        today={loaderData.today}
        timeZone={loaderData.timeZone}
        lastResult={lastResult}
        onDirtyChange={onDirtyChange}
      />
      {conflicts != null && (
        <DayOffConflictModal
          conflicts={conflicts}
          timezone={loaderData.timeZone}
          open={true}
          onClose={() => navigate('/me/days-off')}
        />
      )}
    </>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const { timezone } = context.get(congregationContext)
  const submission = parseWithZod(await request.formData(), { schema: dayOffSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const { startDate, endDate } = absenceWindow(submission.value, timezone)
  const memberId = currentUser.member?.id ?? null

  return withScopeFromContext(context, async db => {
    const created = await createDayOff(db, currentUser.id, memberId, startDate, endDate, currentUser.congregationId)
    if (created == null) {
      return data(submission.reply({ formErrors: [m.days_off_new_invalid_dates()] }), { status: 400 })
    }

    // Assignments belong to a member: an account without one has none to be absent from.
    const conflicts = memberId == null ? [] : await listUserConflictsInRange(db, memberId, startDate, endDate)
    if (conflicts.length > 0) return { conflicts }

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.days_off_new_success())
    return redirect('/me/days-off', { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
