import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteDynamicDocument } from '~/features/display-board/server/board-document.server'
import * as m from '~/i18n/paraglide/messages'
import {
  permissionsContext,
  requirePermission,
  currentAccountContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un document — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const settings = await db.boardDynamicDocumentSettings.findUnique({
      where: {
        id_congregationId: { id: dynamicId, congregationId },
      },
    })

    if (!settings) throw redirect('/board/documents')
    return { settings }
  })
}

export default function DeleteDynamicDocumentPage({ loaderData }: Route.ComponentProps) {
  const { settings } = loaderData

  return (
    <DeleteConfirmation
      title={m.board_dynamic_delete_confirmation({ name: settings.title })}
      submitLabel={m.board_dynamic_delete_button()}
      cancelTo="/board/documents"
    >
      <p>{settings.title}</p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardValidator)

  const session = await getSession(request.headers.get('Cookie'))
  const dynamicId = requireParamId(params.dynamicId, '/board')

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(currentAccountContext)
    const settings = await deleteDynamicDocument(db, dynamicId, congregationId)

    session.flash('success', m.board_dynamic_delete_success({ name: settings.title }))

    return redirect('/board/documents', {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
