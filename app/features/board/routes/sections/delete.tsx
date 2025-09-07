import { Form, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  const section = await db.boardSection.findUnique({ where: { id: requireParamId(params.sectionId, '/board') } })

  if (section == null) {
    throw redirect('/board/sections')
  }

  return { section }
}

export default function DeleteSectionPage({ loaderData }: Route.ComponentProps) {
  const { section } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer la section "{section.name}" ? Cette action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer la section définitivement"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer la section
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  const section = await db.boardSection.delete({ where: { id: requireParamId(params.sectionId, '/board') } })

  session.flash('success', `La section "${section.name}" a été correctement supprimée`)

  return redirect('/board/sections', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
