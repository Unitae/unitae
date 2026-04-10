import { Form, redirect } from 'react-router'

import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardFooter } from '~/shared/ui/card'

import type { Route } from './+types/delete-group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const group = await db.publisherGroup.findUnique({
    where: {
      id: requireParamId(params.groupId, '/congregation/publisher-groups'),
    },
  })

  if (group == null) {
    throw redirect('/congregation/publisher-groups/')
  }

  return { group }
}

export default function DeleteGroup({ loaderData }: Route.ComponentProps) {
  const { group } = loaderData

  return (
    <div className="flex items-center justify-center p-7">
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Êtes-vous sûr de vouloir supprimer le groupe {group.name} ? Cette action est irréversible.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Form method="post">
            <Button type="submit" variant="destructive" title="Supprimer complètement le groupe de prédication">
              Supprimer le groupe {group.name}
            </Button>
          </Form>
        </CardFooter>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const group = await db.publisherGroup.delete({
    where: { id: requireParamId(params.groupId, '/congregation/publisher-groups') },
  })

  session.flash('success', `Le groupe ${group.name} a été correctement supprimé`)

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/congregation/publisher-groups/', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
