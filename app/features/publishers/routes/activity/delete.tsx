import { redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deletePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer une activité — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageActivity = permissions.has(Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

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

    if (activity == null) {
      throw redirect('/publishers/activity')
    }

    return { activity }
  })
}

export default function DeleteActivity({ loaderData }: Route.ComponentProps) {
  const { activity } = loaderData

  const date = new Date()
  date.setMonth(activity.month)
  date.setFullYear(activity.year)

  return (
    <DeleteConfirmation
      title={m.activity_delete_confirmation({
        date: date.toLocaleDateString('fr', { month: 'long', year: 'numeric' }),
        name: `${activity.publisher.firstname} ${activity.publisher.lastname?.toLocaleUpperCase()}`,
      })}
      submitLabel={m.activity_delete_button()}
      cancelTo="/publishers/activity"
    >
      <p>
        {activity.publisher.firstname} {activity.publisher.lastname?.toLocaleUpperCase()} —{' '}
        {date.toLocaleDateString('fr', { month: 'long', year: 'numeric' })}
      </p>
    </DeleteConfirmation>
  )
}

export function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageActivity = permissions.has(Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const activity = await deletePublisherActivity(
      db,
      requireParamId(params.activityId, '/publishers/activity'),
      currentUser.congregationId,
      currentUser.id,
    )

    const session = await getSession(request.headers.get('Cookie'))
    session.flash(
      'success',
      m.activity_delete_success({
        name: `${activity.publisher.firstname} ${activity.publisher.lastname?.toLocaleUpperCase()}`,
      }),
    )

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/publishers/activity', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
