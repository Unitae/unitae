import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createActivitySchema } from '~/features/publishers/schemas/activity.schema'
import { createPublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import { getPublishers } from '~/features/publishers/server/publishers.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { sanitizeUser } from '~/shared/auth/sanitize-user.server'
import { Permission } from '~/shared/types/permission'
import { PublisherType } from '~/shared/types/publisher-type'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_new_meta_title() }]
}

export function loader({ request, context }: Route.LoaderArgs) {
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

  const groupFilter = canManageMyGroupActivity && !canManagePublisher ? currentUser.publisherGroupId : undefined

  const timeRange = new Date()
  const searchParams = new URL(request.url).searchParams
  const month = Number(searchParams.get('month') ?? timeRange.getMonth())
  const year = Number(searchParams.get('year') ?? timeRange.getFullYear())

  return withScopeFromContext(context, async db => {
    const publishers = await getPublishers(db, currentUser.congregationId, { groupId: groupFilter })

    const activity = await db.publisherActivity.findFirst({
      where: {
        year,
        month,
        publisherId: Number(searchParams.get('publisherId')),
      },
    })

    if (activity != null) {
      // If the activity already exists, redirect to the edit page
      throw redirect(`/publishers/activity/${activity.id}/edit`)
    }

    let publisher = null
    if (searchParams.has('publisherId')) {
      publisher = await db.user.findUnique({
        where: {
          id_congregationId: {
            id: Number(searchParams.get('publisherId')),
            congregationId: currentUser.congregationId,
          },
        },
        include: {
          activities: true,
        },
      })
    }

    return {
      publishers: publishers.map(sanitizeUser),
      publisher: publisher != null ? sanitizeUser(publisher) : null,
      selectedMonth: { month, year },
      previousPage: request.headers.get('referer'),
    }
  })
}

export default function NewActivity({ loaderData, actionData }: Route.ComponentProps) {
  const { publishers, publisher, selectedMonth, previousPage } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [pioneer, setPioneer] = useState<PublisherType | null>(
    publisher?.type === PublisherType.PionnierAuxiliaires ? PublisherType.PionnierAuxiliaires : null,
  )
  const { blocker, markDirty } = useUnsavedChanges()

  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createActivitySchema })
    },
  })

  const unavailableMonths = publisher?.activities.filter(a => a.year === selectedMonth.year).map(a => a.month) ?? []

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.activity_new_title()}
        subtitle={m.activity_new_subtitle()}
        breadcrumbs={[
          { label: m.activity_list_title(), to: '/publishers/activity' },
          { label: m.activity_new_title() },
        ]}
        backTo="/publishers/activity"
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.activity_new_report_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <input type="hidden" name="previousPage" value={previousPage ?? ''} />

            <div className="space-y-2">
              <Label htmlFor="publisher">{m.activity_new_publisher_label()}</Label>
              <PersonDropdown
                id="publisher"
                name="publisher"
                people={publishers}
                value={publisher?.id != null ? String(publisher.id) : ''}
                onValueChange={value => {
                  searchParams.set('publisherId', value)
                  setSearchParams(searchParams)
                }}
                placeholder={m.activity_new_publisher_placeholder()}
                allowNone={false}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="month">{m.activity_new_month_label()}</Label>
                <Select
                  name="month"
                  value={String(selectedMonth.month)}
                  onValueChange={value => {
                    searchParams.set('month', value)
                    setSearchParams(searchParams)
                  }}
                >
                  <SelectTrigger id="month" className="w-full">
                    <SelectValue placeholder={m.activity_new_month_placeholder()} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0" disabled={unavailableMonths.includes(0)}>
                      {m.activity_month_january()}
                    </SelectItem>
                    <SelectItem value="1" disabled={unavailableMonths.includes(1)}>
                      {m.activity_month_february()}
                    </SelectItem>
                    <SelectItem value="2" disabled={unavailableMonths.includes(2)}>
                      {m.activity_month_march()}
                    </SelectItem>
                    <SelectItem value="3" disabled={unavailableMonths.includes(3)}>
                      {m.activity_month_april()}
                    </SelectItem>
                    <SelectItem value="4" disabled={unavailableMonths.includes(4)}>
                      {m.activity_month_may()}
                    </SelectItem>
                    <SelectItem value="5" disabled={unavailableMonths.includes(5)}>
                      {m.activity_month_june()}
                    </SelectItem>
                    <SelectItem value="6" disabled={unavailableMonths.includes(6)}>
                      {m.activity_month_july()}
                    </SelectItem>
                    <SelectItem value="7" disabled={unavailableMonths.includes(7)}>
                      {m.activity_month_august()}
                    </SelectItem>
                    <SelectItem value="8" disabled={unavailableMonths.includes(8)}>
                      {m.activity_month_september()}
                    </SelectItem>
                    <SelectItem value="9" disabled={unavailableMonths.includes(9)}>
                      {m.activity_month_october()}
                    </SelectItem>
                    <SelectItem value="10" disabled={unavailableMonths.includes(10)}>
                      {m.activity_month_november()}
                    </SelectItem>
                    <SelectItem value="11" disabled={unavailableMonths.includes(11)}>
                      {m.activity_month_december()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">{m.activity_new_year_label()}</Label>
                <Select
                  name="year"
                  value={String(selectedMonth.year)}
                  onValueChange={value => {
                    searchParams.set('year', value)
                    setSearchParams(searchParams)
                  }}
                >
                  <SelectTrigger id="year" className="w-full">
                    <SelectValue placeholder={m.activity_new_year_placeholder()} />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 19 }, (_, i) => 2022 + i).map(year => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {publisher?.type != null && publisher.type === PublisherType.Normal && (
              <div className="space-y-2">
                <Label htmlFor="type">{m.activity_new_pioneer_label()}</Label>
                <Select
                  name="type"
                  value={pioneer ?? PublisherType.Normal}
                  onValueChange={value => setPioneer(value as PublisherType)}
                >
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PublisherType.Normal}>{m.activity_new_pioneer_none()}</SelectItem>
                    <SelectItem value={PublisherType.PionnierAuxiliaires}>
                      {m.activity_new_pioneer_auxiliary()}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  PublisherType.PionnierAuxiliaires,
                  PublisherType.PionnierPermanant,
                  PublisherType.PionnierSpecial,
                  PublisherType.Missionnaire,
                ] as PublisherType[]
              ).includes(publisher?.type ?? PublisherType.Normal) ||
              (pioneer != null && ([PublisherType.PionnierAuxiliaires] as PublisherType[]).includes(pioneer)) ? (
                <div className="space-y-2">
                  <Label htmlFor={fields.hours.id}>{m.activity_new_hours_label()}</Label>
                  <Input {...getInputProps(fields.hours, { type: 'number' })} key={fields.hours.id} min={0} required />
                  {fields.hours.errors && <p className="text-destructive text-sm">{fields.hours.errors}</p>}
                </div>
              ) : (
                <div className="flex items-center gap-3 self-end">
                  <input className="size-4 rounded border border-input" name="preached" type="checkbox" id="preached" />
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
                  defaultValue={0}
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

export async function action({ request, context }: Route.ActionArgs) {
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

  const submission = parseWithZod(await request.formData(), { schema: createActivitySchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { publisher: publisherId, month, year, hours, studies, observations, preached, previousPage } = submission.value

  return withScopeFromContext(context, async db => {
    const publisher = await db.user.findUnique({
      where: {
        id_congregationId: { id: publisherId, congregationId: currentUser.congregationId },
      },
    })

    const session = await getSession(request.headers.get('Cookie'))
    if (publisher == null) {
      session.flash('error', m.activity_form_error_incomplete())
      throw redirect(previousPage || '/publishers/activity/new', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const type =
      publisher.type === PublisherType.Normal ? (submission.value.type ?? PublisherType.Normal) : publisher.type
    const activity = await createPublisherActivity(db, {
      publisherId: publisher.id,
      month,
      year,
      type,
      isPublisher: hours > 0 ? true : preached,
      hours,
      studies,
      notes: observations,
      congregationId: currentUser.congregationId,
      actorId: currentUser.id,
    })

    session.flash('success', m.activity_new_success({ name: `${publisher.firstname} ${publisher.lastname}` }))
    return redirect(previousPage || `/publishers/activity?month=${activity.month}&year=${activity.year}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
