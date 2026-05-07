import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateActivitySchema } from '~/features/publishers/schemas/activity.schema'
import { updatePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  const userWithRelations = currentUser as typeof currentUser & {
    responsibleFor?: { id: number }
    deputyFor?: { id: number }
  }
  const canManageMyGroupActivity =
    userWithRelations.responsibleFor?.id === currentUser.publisherGroupId ||
    userWithRelations.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const activity = await db.publisherActivity.findFirst({
      where: {
        id: requireParamId(params.activityId, '/publishers/activity'),
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

    return {
      activity,
    }
  })
}

export default function EditActivity({ loaderData, actionData }: Route.ComponentProps) {
  const { activity } = loaderData
  const [type, setType] = useState<PublisherType>(activity.type)

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
            <div className="space-y-2">
              <Label htmlFor="type">{m.activity_edit_pioneer_label()}</Label>
              <Select name="type" value={type} onValueChange={value => setType(value as PublisherType)}>
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PublisherType.Normal}>{m.activity_edit_pioneer_none()}</SelectItem>
                  <SelectItem value={PublisherType.PionnierAuxiliaires}>
                    {m.activity_edit_pioneer_auxiliary()}
                  </SelectItem>
                  <SelectItem value={PublisherType.PionnierPermanant}>{m.activity_edit_pioneer_permanent()}</SelectItem>
                  <SelectItem value={PublisherType.PionnierSpecial}>{m.activity_edit_pioneer_special()}</SelectItem>
                  <SelectItem value={PublisherType.Missionnaire}>{m.activity_edit_pioneer_missionary()}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  PublisherType.PionnierAuxiliaires,
                  PublisherType.PionnierPermanant,
                  PublisherType.PionnierSpecial,
                  PublisherType.Missionnaire,
                ] as PublisherType[]
              ).includes(type) ? (
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

            <SubmitButton className="self-start">{m.activity_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const previousPage = request.headers.get('referer')
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  const userWithRelations = currentUser as typeof currentUser & {
    responsibleFor?: { id: number }
    deputyFor?: { id: number }
  }
  const canManageMyGroupActivity =
    userWithRelations.responsibleFor?.id === currentUser.publisherGroupId ||
    userWithRelations.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateActivitySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { type, hours, studies, observations, preached } = submission.value

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

    await updatePublisherActivity(
      db,
      requireParamId(params.activityId, '/publishers/activity'),
      currentUser.congregationId,
      currentUser.id,
      {
        type: type,
        isPublisher: hours > 0 ? true : preached,
        hours,
        studies,
        notes: observations,
      },
    )

    session.flash(
      'success',
      m.activity_edit_success({ name: `${activity.publisher.firstname} ${activity.publisher.lastname}` }),
    )
    return redirect(previousPage ?? `/publishers/activity?month=${activity.month}&year=${activity.year}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
