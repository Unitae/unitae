import { Form, redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'

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
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le rapport de{' '}
            {date.toLocaleDateString('fr', { month: 'long', year: 'numeric' })} pour {activity.publisher.firstname}{' '}
            {activity.publisher.lastname?.toLocaleUpperCase()} ? Cette action est irréversible.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive" title="Supprimer définitivement le rapport">
              Supprimer le rapport
            </Button>
          </Form>
        </CardFooter>
      </Card>
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
