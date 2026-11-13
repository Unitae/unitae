import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteBoardDocument, isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { deleteAllVersionFiles } from '~/features/display-board/server/document-versions.server'
import { notify } from '~/features/notifications/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

// Deleting is a dialog on the board's list and the edit page; an old link to this address lands on the viewer.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/board/documents/${params.documentId}/viewer`)
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canUploadDocument = permissions.has(Permission.CanUploadBoardDocuments)
  const canManageBoard = permissions.has(Permission.CanReviewBoardDocuments)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const documentId = requireParamId(params.documentId, '/board')

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

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
      userId: currentUser.id,
      document,
    })
    return redirect('/board/documents', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
