import { useState } from 'react'
import { data, Form, redirect, useActionData, useNavigate } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createDayOff } from '~/features/events/server/days-off.server'
import { listUserConflictsInRange } from '~/features/events/server/list-user-conflicts-in-range.server'
import { DayOffConflictModal } from '~/features/events/ui/DayOffConflictModal'
import * as m from '~/i18n/paraglide/messages'
import { congregationContext, currentAccountContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Card, CardContent } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.days_off_new_meta_title() }]
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = context.get(currentAccountContext)
  const congregation = context.get(congregationContext)
  const session = await getSession(request.headers.get('Cookie'))
  logger.info(`Loading personal Days Off form. User ID: ${currentUser.id}.`)

  return {
    user: currentUser,
    timezone: congregation.timezone,
    error: session.get('error'),
  }
}

export default function DaysOffPage({ loaderData }: Route.ComponentProps) {
  const [startDate, setStartDate] = useState('')
  const { blocker, markDirty } = useUnsavedChanges()
  const actionData = useActionData<typeof action>()
  const navigate = useNavigate()
  const [modalDismissed, setModalDismissed] = useState(false)

  const minimumEndDate = new Date(startDate.length > 0 ? startDate : new Date().toISOString().split('T')[0])
  minimumEndDate.setDate(minimumEndDate.getDate() + 1)

  const conflicts = actionData?.conflicts ?? null
  const showModal = conflicts != null && conflicts.length > 0 && !modalDismissed

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.days_off_new_page_title()}
        subtitle={m.days_off_new_page_subtitle()}
        breadcrumbs={[{ label: m.sidebar_my_absences(), to: '/me/days-off' }, { label: m.days_off_new_page_title() }]}
        backTo="/me/days-off"
      />

      <Card>
        <CardContent className="pt-6">
          <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="start_date">{m.days_off_new_start_date()}</Label>
              <Input
                id="start_date"
                type="date"
                name="start_date"
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setStartDate(e.target.value)}
                value={startDate}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end_date">{m.days_off_new_end_date()}</Label>
              <Input
                id="end_date"
                type="date"
                name="end_date"
                min={minimumEndDate.toISOString().split('T')[0]}
                required
              />
            </div>
            <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>

      {conflicts != null && (
        <DayOffConflictModal
          conflicts={conflicts}
          timezone={loaderData.timezone}
          open={showModal}
          onClose={() => {
            setModalDismissed(true)
            navigate('/me/days-off')
          }}
        />
      )}
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))
  const formData = await request.formData()
  const startDate = new Date(String(formData.get('start_date')))
  const endDate = new Date(String(formData.get('end_date')))

  logger.info(`Creating new days off. User ID: ${currentUser.id}.`)

  const { congregationId } = currentUser
  const memberId = currentUser.member?.id ?? null

  return withScopeFromContext(context, async db => {
    const event = await createDayOff(db, currentUser.id, memberId, startDate, endDate, congregationId)
    if (event == null) {
      session.flash('error', m.days_off_new_invalid_dates())
      logger.info(`Failed to creating new days off. User ID: ${currentUser.id}.`)

      return redirect('/me/days-off', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    // When there are conflicts we skip the success flash — the modal is
    // the confirmation. Accounts without a linked Member cannot own
    // programme assignments, so we skip the check with a log line so ops
    // can distinguish that branch from a genuine empty result.
    if (memberId == null) {
      logger.info(
        `Days off created for account without linked Member; skipped conflict check. User ID: ${currentUser.id}.`,
      )
    }
    const conflicts = memberId == null ? [] : await listUserConflictsInRange(db, memberId, startDate, endDate)

    if (conflicts.length > 0) {
      logger.info(`Days off created with ${conflicts.length} conflict(s). User ID: ${currentUser.id}.`)
      return data({ conflicts })
    }

    session.flash('success', m.days_off_new_success())
    logger.info(`Successfuly created new days off. User ID: ${currentUser.id}.`)

    return redirect('/me/days-off', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
