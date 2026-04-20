import { Form, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deletePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

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
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
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
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            {m.activity_delete_confirmation({
              date: date.toLocaleDateString('fr', { month: 'long', year: 'numeric' }),
              name: `${activity.publisher.firstname} ${activity.publisher.lastname?.toLocaleUpperCase()}`,
            })}
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive" title={m.activity_delete_title()}>
              {m.activity_delete_button()}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
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
