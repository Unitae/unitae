import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { requireParamId } from '~/shared/libs/params.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Activité du proclamateurs - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, can, db } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Rapport de ${date.toLocaleDateString('fr', {
          month: 'long',
          year: 'numeric',
        })} - ${activity.publisher?.firstname} ${activity.publisher?.lastname?.toLocaleUpperCase()}`}
        subtitle="Modifier le rapport d'activité du proclamateur"
        actions={
          <Button asChild variant="destructive" size="icon" title="Supprimer le rapport">
            <Link to={`/congregation/publishers/activity/${activity.id}/delete`}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Détails du rapport</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Service de pionnier</Label>
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
                <option value={PublisherType.Normal}>Le proclamateur n'a pas pris le service ce mois</option>
                <option value={PublisherType.PionnierAuxiliaires}>
                  Le proclamateur a pris le service de Pionnier Auxiliaire ce mois
                </option>
                <option value={PublisherType.PionnierPermanant}>
                  Le proclamateur était Pionnier Permanent ce mois
                </option>
                <option value={PublisherType.PionnierSpecial}>Le proclamateur était Pionnier Spécial ce mois</option>
                <option value={PublisherType.Missionnaire}>Le proclamateur était Missionnaire ce mois</option>
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
                  <Label htmlFor="hours">Heures</Label>
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
                    Le proclamateur a préché ce mois
                  </Label>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="studies">Études</Label>
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
              <Label htmlFor="observations">Observations</Label>
              <textarea
                id="observations"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                name="observations"
                defaultValue={activity.notes}
              />
            </div>

            <Button type="submit" className="self-start">
              Enregistrer le rapport
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const previousPage = request.headers.get('referer')
  const { currentUser, session, can, db } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

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
