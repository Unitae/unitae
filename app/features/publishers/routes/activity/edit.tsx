import { useState } from 'react'
import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { DeleteLink } from '~/shared/ui/DeleteLink'
import { HeroHeader } from '~/shared/ui/HeroHeader'

import type { Route } from './+types/edit'

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
}

export default function EditActivity({ loaderData }: Route.ComponentProps) {
  const { activity } = loaderData
  const [type, setType] = useState<PublisherType>(activity.type as PublisherType)

  const date = new Date()
  date.setMonth(activity.month)
  date.setFullYear(activity.year)

  return (
    <div className="flex flex-col">
      <HeroHeader
        title={`Rapport de ${date.toLocaleDateString('fr', {
          month: 'long',
          year: 'numeric',
        })} - ${activity.publisher?.firstname} ${activity.publisher?.lastname?.toLocaleUpperCase()}`}
        subtitle="Modifier le rapport d'activité du proclamateur"
        actions={
          <DeleteLink title="Supprimer le rapport" action={`/congregation/publishers/activity/${activity.id}/delete`} />
        }
      />

      <Form method="post" className="my-5 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1">
            Service de pionnier
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="type"
              value={type as string}
              onChange={event => {
                setType(event.target.value as PublisherType)
              }}
              required
            >
              <option value={PublisherType.Normal}>Le proclamateur n'a pas pris le service ce mois</option>
              <option value={PublisherType.PionnierAuxiliaires}>
                Le proclamateur a pris le service de Pionnier Auxiliaire ce mois
              </option>
              <option value={PublisherType.PionnierPermanant}>Le proclamateur était Pionnier Permanent ce mois</option>
              <option value={PublisherType.PionnierSpecial}>Le proclamateur était Pionnier Spécial ce mois</option>
              <option value={PublisherType.Missionnaire}>Le proclamateur était Missionnaire ce mois</option>
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          {[
            PublisherType.PionnierAuxiliaires,
            PublisherType.PionnierPermanant,
            PublisherType.PionnierSpecial,
            PublisherType.Missionnaire,
          ].includes(type as PublisherType) ? (
            <label className="flex-1">
              Heures
              <input
                className="w-full rounded-md border p-1 dark:border-gray-300"
                name="hours"
                type="number"
                required
                defaultValue={activity.hours ?? 0}
                min={0}
              />
            </label>
          ) : (
            <label className="flex flex-1 items-center gap-3">
              <input
                className="rounded-md border p-1 dark:border-gray-300"
                name="preached"
                type="checkbox"
                defaultChecked={activity.isPublisher}
              />
              <span className="flex-1">Le proclamateur a préché ce mois</span>
            </label>
          )}
          <label className="flex-1">
            Etudes
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="studies"
              type="number"
              defaultValue={activity.studies ?? 0}
              required
              min={0}
            />
          </label>
        </div>

        <div className="flex gap-3">
          <label className="flex-1">
            Observations
            <textarea
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="observations"
              defaultValue={activity.notes}
            />
          </label>
        </div>

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Enregistrer le rapport
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const previousPage = request.headers.get('referer')
  const { currentUser, session } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageMyGroupActivity =
    currentUser.responsibleFor?.id === currentUser.publisherGroupId ||
    currentUser.deputyFor?.id === currentUser.publisherGroupId

  if (!canManagePublisher && !canManageMyGroupActivity) {
    throw redirect('/')
  }

  const form = await request.formData()
  const activity = await db.publisherActivity.findUnique({
    where: {
      id: requireParamId(params.activityId, '/congregation/publishers/activity'),
    },
    include: {
      publisher: true,
    },
  })

  const preached = form.get('preached') === 'on'
  const hours = Number(form.get('hours'))
  const studies = Number(form.get('studies'))
  const observations = String(form.get('observations'))

  if (activity?.publisher == null) {
    session.flash('error', 'Veuillez remplir entièrement le formulaire avant soumission')
    throw redirect(previousPage ?? '/congregation/publishers/activity/new', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const type = form.get('type') as PublisherType
  await db.publisherActivity.update({
    where: {
      id: requireParamId(params.activityId, '/congregation/publishers/activity'),
    },
    data: {
      type,
      isPublisher: hours > 0 ? true : preached,
      hours,
      studies,
      notes: observations,
    },
  })

  session.flash(
    'success',
    `Le rapport d'activité de ${activity.publisher.firstname} ${activity.publisher.lastname} à été enregistré avec succès`,
  )
  return redirect(previousPage ?? `/congregation/publishers/activity?month=${activity.month}&year=${activity.year}`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
