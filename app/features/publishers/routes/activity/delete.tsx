import { Form, redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { deletePublisherActivity } from '~/features/publishers/server/publisher-activity-mutations.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.ActivityManager])
  const canManageActivity = can(Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const activity = await db.publisherActivity.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.activityId, '/congregation/publishers/activity'),
          congregationId,
        },
      },
      include: {
        publisher: true,
      },
    })

    if (activity == null) {
      throw redirect('/congregation/publishers/activity')
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

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.ActivityManager])
  const canManageActivity = can(Role.ActivityManager)

  if (!canManageActivity) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const activity = await deletePublisherActivity(
      db,
      requireParamId(params.activityId, '/congregation/publishers/activity'),
      congregationId,
    )

    session.flash(
      'success',
      m.activity_delete_success({
        name: `${activity.publisher.firstname} ${activity.publisher.lastname?.toLocaleUpperCase()}`,
      }),
    )

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/congregation/publishers/activity', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
