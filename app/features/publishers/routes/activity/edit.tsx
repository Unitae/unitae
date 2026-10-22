import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { getMonthEnrolment } from '~/features/publishers/index.server'
import { reportTypeForMonth } from '~/features/publishers/model/activity-report-type'
import { updateActivitySchema } from '~/features/publishers/schemas/activity.schema'
import { updatePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import { ActivityCreditField } from '~/features/publishers/ui/ActivityCreditField'
import { ActivityPioneerField } from '~/features/publishers/ui/ActivityPioneerField'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { PublisherType, publisherTypeReportsHours } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { FormActions } from '~/shared/ui/FormActions'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublishers)

  const member = currentUser.member
  const canManageMyGroupActivity =
    member != null &&
    (member.responsibleFor?.id === member.publisherGroupId || member.deputyFor?.id === member.publisherGroupId)

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const activity = await db.publisherActivity.findFirst({
      where: {
        id: requireParamId(params.activityId, '/publishers/activity'),
        congregationId,
      },
      include: {
        publisher: {
          include: {
            publisherGroup: true,
            activities: true,
          },
        },
      },
    })

    if (activity == null) {
      // If the activity already exists, redirect to the edit page
      throw redirect('/publishers/activity')
    }

    // As on the new form: the enrolment covering the month decides the type, so the form shows it
    // read-only instead of offering a choice.
    const { publisherId, month, year } = activity
    const monthEnrolment = await getMonthEnrolment(db, publisherId, congregationId, month, year)

    return {
      activity,
      monthEnrolment,
      // Secretary-only: group responsibles reach this form through the group bypass and
      // must not see (or set) the credit — they describe the month in the observations.
      canGrantCredit: permissions.has(Permission.CanCorrectActivity),
    }
  })
}

export default function EditActivity({ loaderData, actionData }: Route.ComponentProps) {
  const { activity, monthEnrolment, canGrantCredit } = loaderData
  const [chosenType, setChosenType] = useState<PublisherType>(activity.type)
  const type = reportTypeForMonth(monthEnrolment, chosenType)

  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateActivitySchema })
    },
  })

  const date = new Date()
  date.setMonth(activity.month)
  date.setFullYear(activity.year)

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.activity_edit_title({
          date: date.toLocaleDateString('fr', { month: 'long', year: 'numeric' }),
          name: `${activity.publisher?.firstname} ${activity.publisher?.lastname?.toLocaleUpperCase()}`,
        })}
        subtitle={m.activity_edit_subtitle()}
        breadcrumbs={[
          { label: m.activity_list_title(), to: '/publishers/activity' },
          {
            label: m.activity_edit_title({
              date: date.toLocaleDateString('fr', { month: 'long', year: 'numeric' }),
              name: `${activity.publisher?.firstname} ${activity.publisher?.lastname?.toLocaleUpperCase()}`,
            }),
          },
        ]}
        backTo="/publishers/activity"
        actions={
          <Button asChild variant="destructive" size="icon" title={m.activity_edit_delete_title()}>
            <Link to={`/publishers/activity/${activity.id}/delete`}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.activity_edit_report_details()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <ActivityPioneerField
              enrolment={monthEnrolment}
              options={Object.values(PublisherType)}
              value={chosenType}
              onChange={setChosenType}
              recordedType={activity.type}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {publisherTypeReportsHours(type) ? (
                <div className="space-y-2">
                  <Label htmlFor={fields.hours.id}>{m.activity_new_hours_label()}</Label>
                  <Input
                    {...getInputProps(fields.hours, { type: 'number' })}
                    key={fields.hours.id}
                    defaultValue={activity.hours ?? 0}
                    min={0}
                    required
                  />
                  {fields.hours.errors && <p className="text-destructive text-sm">{fields.hours.errors}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-3 self-end">
                  <input
                    className="size-4 rounded border border-input"
                    name="preached"
                    type="checkbox"
                    id="preached"
                    defaultChecked={activity.isPublisher}
                  />
                  <Label htmlFor="preached" className="font-normal">
                    {m.activity_new_preached_label()}
                  </Label>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={fields.studies.id}>{m.activity_new_studies_label()}</Label>
                <Input
                  {...getInputProps(fields.studies, { type: 'number' })}
                  key={fields.studies.id}
                  defaultValue={activity.studies ?? 0}
                  min={0}
                  required
                />
                {fields.studies.errors && <p className="text-destructive text-sm">{fields.studies.errors}</p>}
              </div>
            </div>

            {/* Only pioneers count their hours, so only their reports can carry a credit. */}
            {canGrantCredit && type !== PublisherType.Normal && (
              <ActivityCreditField name={fields.creditHours.name} defaultValue={activity.creditHours} />
            )}

            <div className="space-y-2">
              <Label htmlFor={fields.observations.id}>{m.activity_new_observations_label()}</Label>
              <textarea
                id={fields.observations.id}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                name={fields.observations.name}
                defaultValue={activity.notes}
              />
              {fields.observations.errors && <p className="text-destructive text-sm">{fields.observations.errors}</p>}
            </div>

            <FormActions>
              <SubmitButton>{m.activity_new_submit()}</SubmitButton>
            </FormActions>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const previousPage = request.headers.get('referer')
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublishers)

  const member = currentUser.member
  const canManageMyGroupActivity =
    member != null &&
    (member.responsibleFor?.id === member.publisherGroupId || member.deputyFor?.id === member.publisherGroupId)

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateActivitySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { type, hours, studies, observations, preached, creditHours } = submission.value

  return withScopeFromContext(context, async db => {
    const activity = await db.publisherActivity.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.activityId, '/publishers/activity'),
          congregationId: currentUser.congregationId,
        },
      },
      include: {
        publisher: true,
      },
    })

    const session = await getSession(request.headers.get('Cookie'))
    if (activity?.publisher == null) {
      session.flash('error', m.activity_form_error_incomplete())
      throw redirect(previousPage ?? '/publishers/activity/new', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    // The enrolment covering the month decides the type, whatever was submitted.
    const { publisherId, month, year } = activity
    const enrolment = await getMonthEnrolment(db, publisherId, currentUser.congregationId, month, year)

    await updatePublisherActivity(
      db,
      requireParamId(params.activityId, '/publishers/activity'),
      currentUser.congregationId,
      currentUser.id,
      {
        type: reportTypeForMonth(enrolment, type),
        isPublisher: hours > 0 ? true : preached,
        hours,
        studies,
        notes: observations,
        // Server-side gate, not just a hidden field. A non-secretary's submit omits the
        // parameter entirely, leaving the stored credit untouched; a secretary's submit
        // always writes it — the field's value, or null when it was emptied or hidden
        // (a « Normal » month cannot carry a credit).
        ...(permissions.has(Permission.CanCorrectActivity) ? { creditHours: creditHours ?? null } : {}),
      },
    )

    // A cleared credit is named, never silent — a « Normal » save clears it with the field hidden.
    const name = `${activity.publisher.firstname} ${activity.publisher.lastname}`
    const clearedCredit =
      permissions.has(Permission.CanCorrectActivity) && activity.creditHours != null && creditHours == null
    session.flash(
      'success',
      clearedCredit
        ? m.activity_edit_success_credit_cleared({ name, hours: activity.creditHours ?? 0 })
        : m.activity_edit_success({ name }),
    )
    return redirect(previousPage ?? `/publishers/activity?month=${activity.month}&year=${activity.year}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
