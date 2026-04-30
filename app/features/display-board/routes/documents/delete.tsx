import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteBoardDocument } from '~/features/display-board/server/board-document.server'
import { deleteAllVersionFiles } from '~/features/display-board/server/document-versions.server'
import { notify } from '~/features/notifications/server/notify.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, requireRole, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un document — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardUploader)

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
      },
    })

    if (document == null) {
      throw redirect('/board/sections')
    }

    return { document }
  })
}

export default function DeleteDocumentPage({ loaderData }: Route.ComponentProps) {
  const { document } = loaderData

  return (
    <DeleteConfirmation
      title={m.board_documents_delete_confirmation({ name: document.title })}
      submitLabel={m.board_documents_delete_button()}
      cancelTo="/board/documents"
    >
      <p>{document.title}</p>
    </DeleteConfirmation>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requireRole(permissions, Role.BoardUploader)

  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const documentId = requireParamId(params.documentId, '/board')

    // Delete version files before cascade removes the rows
    await deleteAllVersionFiles(db, documentId)

    const document = await deleteBoardDocument(db, documentId, congregationId, currentUser.id)

    await notify(db, {
      type: 'board.document.deleted',
      entityType: 'BoardDocument',
      entityId: documentId,
      congregationId,
      actorId: currentUser.id,
      payload: { title: document.title },
    })

    session.flash('success', m.board_documents_delete_success({ name: document.title }))
    logger.info(`Document removed. User ID: ${currentUser.id}. Document ID: ${document.id}.`, {
      currentUser,
      document,
    })
    return redirect('/board/documents', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
