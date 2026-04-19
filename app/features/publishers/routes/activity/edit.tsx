import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateActivitySchema } from '~/features/publishers/schemas/activity.schema'
import { updatePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_edit_meta_title() }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

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
        id: requireParamId(params.activityId, '/congregation/publishers/activity'),
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
      throw redirect('/congregation/publishers/activity')
    }

    return {
      activity,
    }
  })
}

export default function EditActivity({ loaderData }: Route.ComponentProps) {
  const { activity } = loaderData
  const [type, setType] = useState<PublisherType>(activity.type as PublisherType)

  const date = new Date()
  date.setMonth(activity.month)
  date.setFullYear(activity.year)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.activity_edit_title({
          date: date.toLocaleDateString('fr', { month: 'long', year: 'numeric' }),
          name: `${activity.publisher?.firstname} ${activity.publisher?.lastname?.toLocaleUpperCase()}`,
        })}
        subtitle={m.activity_edit_subtitle()}
        actions={
          <Button asChild variant="destructive" size="icon" title={m.activity_edit_delete_title()}>
            <Link to={`/congregation/publishers/activity/${activity.id}/delete`}>
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
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">{m.activity_edit_pioneer_label()}</Label>
              <select
                id="type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                name="type"
                value={type as string}
                onChange={event => {
                  setType(event.target.value as PublisherType)
                }}
                required
              >
                <option value={PublisherType.Normal}>{m.activity_edit_pioneer_none()}</option>
                <option value={PublisherType.PionnierAuxiliaires}>{m.activity_edit_pioneer_auxiliary()}</option>
                <option value={PublisherType.PionnierPermanant}>{m.activity_edit_pioneer_permanent()}</option>
                <option value={PublisherType.PionnierSpecial}>{m.activity_edit_pioneer_special()}</option>
                <option value={PublisherType.Missionnaire}>{m.activity_edit_pioneer_missionary()}</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                PublisherType.PionnierAuxiliaires,
                PublisherType.PionnierPermanant,
                PublisherType.PionnierSpecial,
                PublisherType.Missionnaire,
              ].includes(type as PublisherType) ? (
                <div className="space-y-2">
                  <Label htmlFor="hours">{m.activity_new_hours_label()}</Label>
                  <Input id="hours" name="hours" type="number" required defaultValue={activity.hours ?? 0} min={0} />
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
                <Label htmlFor="studies">{m.activity_new_studies_label()}</Label>
                <Input
                  id="studies"
                  name="studies"
                  type="number"
                  defaultValue={activity.studies ?? 0}
                  required
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observations">{m.activity_new_observations_label()}</Label>
              <textarea
                id="observations"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                name="observations"
                defaultValue={activity.notes}
              />
            </div>

            <Button type="submit" className="self-start">
              {m.activity_new_submit()}
            </Button>
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
  const canManagePublisher = permissions.has(Role.PublisherManager)

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
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.activityId, '/congregation/publishers/activity'),
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
      throw redirect(previousPage ?? '/congregation/publishers/activity/new', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    await updatePublisherActivity(
      db,
      requireParamId(params.activityId, '/congregation/publishers/activity'),
      currentUser.congregationId,
      {
        type: type as PublisherType,
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
    return redirect(previousPage ?? `/congregation/publishers/activity?month=${activity.month}&year=${activity.year}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
