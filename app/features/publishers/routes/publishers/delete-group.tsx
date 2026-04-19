import { Form, redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { deletePublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'

import type { Route } from './+types/delete-group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const group = await db.publisherGroup.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: requireParamId(params.groupId, '/congregation/publisher-groups'), congregationId },
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

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const group = await deletePublisherGroup(
      db,
      requireParamId(params.groupId, '/congregation/publisher-groups'),
      congregationId,
    )

    session.flash('success', m.groups_delete_success({ name: group.name }))

    const previousPage = request.headers.get('referer')
    return redirect(previousPage ?? '/congregation/publisher-groups/', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
