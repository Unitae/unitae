import { Form, redirect } from 'react-router'

import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete-group'

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const group = await db.publisherGroup.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: {
          id: requireParamId(params.groupId, '/congregation/publisher-groups'),
          congregationId: currentUser.congregationId,
        },
      },
    })

    if (group == null) {
      throw redirect('/congregation/publisher-groups/')
    }

    return { group }
  })
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { group } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">{m.groups_delete_confirmation({ name: group.name })}</p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive" title={m.groups_delete_title()}>
              {m.groups_delete_button({ name: group.name })}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const group = await deletePublisherGroup(
      db,
      requireParamId(params.groupId, '/congregation/publisher-groups'),
      currentUser.congregationId,
    )

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.groups_delete_success({ name: group.name }))

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/congregation/publisher-groups/', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
