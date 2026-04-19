import { useState } from 'react'
import { Form, redirect, useSearchParams } from 'react-router'
import { sanitizeUser } from '~/shared/libs/sanitize-user.server'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { createPublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import { getPublishers } from '~/features/publishers/server/publishers.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.activity_new_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  const canManageMyGroupActivity =
    currentUser.responsibleFor?.id === currentUser.publisherGroupId ||
    currentUser.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const groupFilter = canManageMyGroupActivity && !canManagePublisher ? currentUser.publisherGroupId : undefined

  const timeRange = new Date()
  const searchParams = new URL(request.url).searchParams
  const month = Number(searchParams.get('month') ?? timeRange.getMonth())
  const year = Number(searchParams.get('year') ?? timeRange.getFullYear())

  return withScope(congregationId, async db => {
    const publishers = await getPublishers(db, congregationId, { groupId: groupFilter })

    const activity = await db.publisherActivity.findFirst({
      where: {
        year,
        month,
        publisherId: Number(searchParams.get('publisherId')),
      },
    })

    if (activity != null) {
      // If the activity already exists, redirect to the edit page
      throw redirect(`/congregation/publishers/activity/${activity.id}/edit`)
    }

    let publisher = null
    if (searchParams.has('publisherId')) {
      publisher = await db.user.findUnique({
        where: {
          // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
          id_congregationId: { id: Number(searchParams.get('publisherId')), congregationId },
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

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const { publishers, publisher, selectedMonth, previousPage } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [pioneer, setPioneer] = useState<PublisherType | null>(
    publisher?.type === PublisherType.PionnierAuxiliaires ? PublisherType.PionnierAuxiliaires : null,
  )

  const unavailableMonths = publisher?.activities.filter(a => a.year === selectedMonth.year).map(a => a.month) ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.activity_new_title()} subtitle={m.activity_new_subtitle()} />

      <Card>
        <CardHeader>
          <CardTitle>{m.activity_new_report_info()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="previousPage" value={previousPage ?? ''} />

            <div className="space-y-2">
              <Label htmlFor="publisher">{m.activity_new_publisher_label()}</Label>
              <select
                id="publisher"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                name="publisher"
                value={publisher?.id}
                onChange={event => {
                  searchParams.set('publisherId', event.target.value)
                  setSearchParams(searchParams)
                }}
                required
              >
                <option>{m.activity_new_publisher_placeholder()}</option>
                {publishers.map(p => (
                  <option key={p.id} value={p?.id}>
                    {p.firstname} {p.lastname?.toLocaleUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="month">{m.activity_new_month_label()}</Label>
                <select
                  id="month"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="month"
                  value={selectedMonth.month}
                  onChange={event => {
                    searchParams.set('month', event.target.value)
                    setSearchParams(searchParams)
                  }}
                  required
                >
                  <option>{m.activity_new_month_placeholder()}</option>
                  <option value={0} disabled={unavailableMonths.includes(0)}>
                    {m.activity_month_january()}
                  </option>
                  <option value={1} disabled={unavailableMonths.includes(1)}>
                    {m.activity_month_february()}
                  </option>
                  <option value={2} disabled={unavailableMonths.includes(2)}>
                    {m.activity_month_march()}
                  </option>
                  <option value={3} disabled={unavailableMonths.includes(3)}>
                    {m.activity_month_april()}
                  </option>
                  <option value={4} disabled={unavailableMonths.includes(4)}>
                    {m.activity_month_may()}
                  </option>
                  <option value={5} disabled={unavailableMonths.includes(5)}>
                    {m.activity_month_june()}
                  </option>
                  <option value={6} disabled={unavailableMonths.includes(6)}>
                    {m.activity_month_july()}
                  </option>
                  <option value={7} disabled={unavailableMonths.includes(7)}>
                    {m.activity_month_august()}
                  </option>
                  <option value={8} disabled={unavailableMonths.includes(8)}>
                    {m.activity_month_september()}
                  </option>
                  <option value={9} disabled={unavailableMonths.includes(9)}>
                    {m.activity_month_october()}
                  </option>
                  <option value={10} disabled={unavailableMonths.includes(10)}>
                    {m.activity_month_november()}
                  </option>
                  <option value={11} disabled={unavailableMonths.includes(11)}>
                    {m.activity_month_december()}
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">{m.activity_new_year_label()}</Label>
                <select
                  id="year"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="year"
                  value={selectedMonth.year}
                  onChange={event => {
                    searchParams.set('year', event.target.value)
                    setSearchParams(searchParams)
                  }}
                  required
                >
                  <option>{m.activity_new_year_placeholder()}</option>
                  <option value={2022}>2022</option>
                  <option value={2023}>2023</option>
                  <option value={2024}>2024</option>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                  <option value={2028}>2028</option>
                  <option value={2029}>2029</option>
                  <option value={2030}>2030</option>
                  <option value={2031}>2031</option>
                  <option value={2032}>2032</option>
                  <option value={2033}>2033</option>
                  <option value={2034}>2034</option>
                  <option value={2035}>2035</option>
                  <option value={2036}>2036</option>
                  <option value={2037}>2037</option>
                  <option value={2038}>2038</option>
                  <option value={2039}>2039</option>
                  <option value={2040}>2040</option>
                </select>
              </div>
            </div>

            {[PublisherType.Normal].includes(publisher?.type as PublisherType) && (
              <div className="space-y-2">
                <Label htmlFor="type">{m.activity_new_pioneer_label()}</Label>
                <select
                  id="type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="type"
                  value={pioneer as string}
                  onChange={event => {
                    setPioneer(event.target.value as PublisherType)
                  }}
                  required
                >
                  <option value={PublisherType.Normal}>{m.activity_new_pioneer_none()}</option>
                  <option value={PublisherType.PionnierAuxiliaires}>{m.activity_new_pioneer_auxiliary()}</option>
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                PublisherType.PionnierAuxiliaires,
                PublisherType.PionnierPermanant,
                PublisherType.PionnierSpecial,
                PublisherType.Missionnaire,
              ].includes(publisher?.type as PublisherType) ||
              [PublisherType.PionnierAuxiliaires].includes(pioneer as PublisherType) ? (
                <div className="space-y-2">
                  <Label htmlFor="hours">{m.activity_new_hours_label()}</Label>
                  <Input id="hours" name="hours" type="number" required min={0} />
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
                <Label htmlFor="studies">{m.activity_new_studies_label()}</Label>
                <Input id="studies" name="studies" type="number" defaultValue={0} min={0} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observations">{m.activity_new_observations_label()}</Label>
              <textarea
                id="observations"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                name="observations"
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

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session, can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  const canManageMyGroupActivity =
    currentUser.responsibleFor?.id === currentUser.publisherGroupId ||
    currentUser.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const form = await request.formData()
  const previousPage = String(form.get('previousPage'))
  const publisherId = Number(form.get('publisher'))
  const month = Number(form.get('month'))
  const year = Number(form.get('year'))

  return withScope(congregationId, async db => {
    const publisher = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: publisherId, congregationId },
      },
    })

    const preached = form.get('preached') === 'on'
    const hours = Number(form.get('hours'))
    const studies = Number(form.get('studies'))
    const observations = String(form.get('observations'))

    if (publisher == null) {
      session.flash('error', m.activity_form_error_incomplete())
      throw redirect(previousPage ?? '/congregation/publishers/activity/new', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const type =
      publisher.type === PublisherType.Normal
        ? (form.get('type') as PublisherType)
        : (publisher.type ?? PublisherType.Normal)
    const activity = await createPublisherActivity(db, {
      publisherId: publisher.id,
      month,
      year,
      type,
      isPublisher: hours > 0 ? true : preached,
      hours,
      studies,
      notes: observations,
      congregationId,
    })

    session.flash('success', m.activity_new_success({ name: `${publisher.firstname} ${publisher.lastname}` }))
    return redirect(previousPage ?? `/congregation/publishers/activity?month=${activity.month}&year=${activity.year}`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
