import { Form, redirect } from 'react-router'

import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete-group'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

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
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer le groupe {group.name} ? Cette action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer complètement le groupe de prédication"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer le groupe {group.name}
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }
  const group = await db.publisherGroup.delete({ where: { id: requireParamId(params.groupId, '/congregation/publisher-groups') } })

  session.flash('success', `Le groupe ${group.name} a été correctement supprimé`)

  const previousPage = request.headers.get('referer')
  return redirect(previousPage ?? '/congregation/publisher-groups/', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
