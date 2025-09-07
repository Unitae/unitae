import { Form, redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

  const activity = await db.publisherActivity.findUnique({
    where: {
      id: requireParamId(params.activityId, '/congregation/publishers/activity'),
    },
    include: {
      publisher: true,
    },
  })

  if (activity == null) {
    throw redirect('/congregation/publishers/activity')
  }

  return { activity }
}

export default function DeleteActivity({ loaderData }: Route.ComponentProps) {
  const { activity } = loaderData

  const date = new Date()
  date.setMonth(activity.month)
  date.setFullYear(activity.year)

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer le rapport de{' '}
        {date.toLocaleDateString('fr', { month: 'long', year: 'numeric' })} pour {activity.publisher.firstname}{' '}
        {activity.publisher.lastname?.toLocaleUpperCase()} ? Cette action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer définitivement le rapport"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer le rapport
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

  const activity = await db.publisherActivity.delete({
    where: { id: requireParamId(params.activityId, '/congregation/publishers/activity') },
    include: { publisher: true },
  })

  session.flash(
    'success',
    `Le rapport d'activité de ${activity.publisher.firstname} ${activity.publisher.lastname?.toLocaleUpperCase()} a été correctement supprimé`,
  )

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/congregation/publishers/activity', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
