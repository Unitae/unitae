import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { deleteBoardDocument, isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { deleteAllVersionFiles } from '~/features/display-board/server/document-versions.server'
import { notify } from '~/features/notifications/index.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { DeleteConfirmation } from '~/shared/ui/DeleteConfirmation'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Supprimer un document — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canUploadDocument = permissions.has(Permission.CanUploadBoardDocuments)
  const canManageBoard = permissions.has(Permission.CanReviewBoardDocuments)

  if (!canUploadDocument && !canManageBoard) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const documentId = requireParamId(params.documentId, '/board')
    const document = await db.boardDocument.findUnique({
      where: {
        id_congregationId: { id: documentId, congregationId: currentUser.congregationId },
      },
    })

    if (document == null) {
      throw redirect('/board/sections')
    }

    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

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
