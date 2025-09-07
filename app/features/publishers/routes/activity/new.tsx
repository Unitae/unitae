import { useState } from 'react'
import { Form, redirect, useSearchParams } from 'react-router'
import { getPublishers } from '~/features/publishers/server/publishers'
import { sanitizeUser } from '~/features/authentication/server/sanitize-user.server'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { PublisherType } from '~/shared/types/publisher-type'
import type { Route } from './+types/new'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Activité du proclamateurs - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageMyGroupActivity =
    currentUser.responsibleFor?.id === currentUser.publisherGroupId ||
    currentUser.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const groupFilter = canManageMyGroupActivity && !canManagePublisher ? currentUser.publisherGroupId : undefined
  const publishers = await getPublishers({ groupId: groupFilter })

  const timeRange = new Date()
  const searchParams = new URL(request.url).searchParams
  const month = Number(searchParams.get('month') ?? timeRange.getMonth())
  const year = Number(searchParams.get('year') ?? timeRange.getFullYear())

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
        id: Number(searchParams.get('publisherId')),
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
}

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const { publishers, publisher, selectedMonth, previousPage } = loaderData
  const [searchParams, setSearchParams] = useSearchParams()
  const [pioneer, setPioneer] = useState<PublisherType | null>(
    publisher?.type === PublisherType.PionnierAuxiliaires ? PublisherType.PionnierAuxiliaires : null,
  )

  const unavailableMonths = publisher?.activities.filter(a => a.year === selectedMonth.year).map(a => a.month) ?? []

  return (
    <div className="flex flex-col">
      <h1 className="my-3 font-bold text-4xl">Nouveau rapport d'activité</h1>
      <p className="text-gray-500">Créer un nouveau rapport d'activité pour un proclamateur</p>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <input type="hidden" name="previousPage" value={previousPage ?? ''} />
        <div className="flex gap-3">
          <label className="flex-1">
            Proclamateur
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="publisher"
              value={publisher?.id}
              onChange={event => {
                searchParams.set('publisherId', event.target.value)
                setSearchParams(searchParams)
              }}
              required
            >
              <option>Sélectionner un proclamateur</option>
              {publishers.map(p => (
                <option key={p.id} value={p?.id}>
                  {p.firstname} {p.lastname?.toLocaleUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            Mois concerné
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="month"
              value={selectedMonth.month}
              onChange={event => {
                searchParams.set('month', event.target.value)
                setSearchParams(searchParams)
              }}
              required
            >
              <option>Mois</option>
              <option value={0} disabled={unavailableMonths.includes(0)}>
                Janvier
              </option>
              <option value={1} disabled={unavailableMonths.includes(1)}>
                Février
              </option>
              <option value={2} disabled={unavailableMonths.includes(2)}>
                Mars
              </option>
              <option value={3} disabled={unavailableMonths.includes(3)}>
                Avril
              </option>
              <option value={4} disabled={unavailableMonths.includes(4)}>
                Mai
              </option>
              <option value={5} disabled={unavailableMonths.includes(5)}>
                Juin
              </option>
              <option value={6} disabled={unavailableMonths.includes(6)}>
                Juillet
              </option>
              <option value={7} disabled={unavailableMonths.includes(7)}>
                Aout
              </option>
              <option value={8} disabled={unavailableMonths.includes(8)}>
                Septembre
              </option>
              <option value={9} disabled={unavailableMonths.includes(9)}>
                Octobre
              </option>
              <option value={10} disabled={unavailableMonths.includes(10)}>
                Novembre
              </option>
              <option value={11} disabled={unavailableMonths.includes(11)}>
                Décembre
              </option>
            </select>
          </label>
          <label className="flex-1">
            Année
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="year"
              value={selectedMonth.year}
              onChange={event => {
                searchParams.set('year', event.target.value)
                setSearchParams(searchParams)
              }}
              required
            >
              <option>Année</option>
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
          </label>
        </div>
        {[PublisherType.Normal].includes(publisher?.type as PublisherType) && (
          <div className="flex gap-3">
            <label className="flex-1">
              Service de pionnier
              <select
                className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
                name="type"
                value={pioneer as string}
                onChange={event => {
                  setPioneer(event.target.value as PublisherType)
                }}
                required
              >
                <option value={PublisherType.Normal}>Le proclamateur n'a pas pris le service</option>
                <option value={PublisherType.PionnierAuxiliaires}>
                  Le proclamateur a pris le service de Pionnier Auxiliaire ce mois
                </option>
              </select>
            </label>
          </div>
        )}

        <div className="flex gap-3">
          {[
            PublisherType.PionnierAuxiliaires,
            PublisherType.PionnierPermanant,
            PublisherType.PionnierSpecial,
            PublisherType.Missionnaire,
          ].includes(publisher?.type as PublisherType) ||
          [PublisherType.PionnierAuxiliaires].includes(pioneer as PublisherType) ? (
            <label className="flex-1">
              Heures
              <input
                className="w-full rounded-md border p-1 dark:border-gray-300"
                name="hours"
                type="number"
                required
                min={0}
              />
            </label>
          ) : (
            <label className="flex flex-1 items-center gap-3">
              <input className="rounded-md border p-1 dark:border-gray-300" name="preached" type="checkbox" />
              <span className="flex-1">Le proclamateur a préché ce mois</span>
            </label>
          )}
          <label className="flex-1">
            Etudes
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="studies"
              type="number"
              defaultValue={0}
              min={0}
              required
            />
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex-1">
            Observations
            <textarea className="w-full rounded-md border p-1 dark:border-gray-300" name="observations" />
          </label>
        </div>

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Enregistrer le rapport
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, session } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
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

  const publisher = await db.user.findUnique({
    where: {
      id: publisherId,
    },
  })

  const preached = form.get('preached') === 'on'
  const hours = Number(form.get('hours'))
  const studies = Number(form.get('studies'))
  const observations = String(form.get('observations'))

  if (publisher == null) {
    session.flash('error', 'Veuillez remplir entièrement le formulaire avant soumission')
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
  const activity = await db.publisherActivity.create({
    data: {
      publisherId: publisher.id,
      month,
      year,
      type,
      isPublisher: hours > 0 ? true : preached,
      hours,
      studies,
      notes: observations,
      congregationId: 0 as number,
    },
  })

  session.flash(
    'success',
    `Le rapport d'activité de ${publisher.firstname} ${publisher.lastname} à été enregistré avec succès`,
  )
  return redirect(previousPage ?? `/congregation/publishers/activity?month=${activity.month}&year=${activity.year}`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
