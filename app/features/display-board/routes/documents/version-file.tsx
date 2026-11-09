import { redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { getFileStream } from '~/features/display-board/server/document.server'
import { findVersionFile } from '~/features/display-board/server/document-form.queries'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/version-file'

/**
 * One version's own file, from the document's history. Guarded as the edit page is: a reviewer, or
 * the uploader of the document.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canUpload = permissions.has(Permission.CanUploadBoardDocuments)
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  if (!canUpload && !canReview) throw redirect('/')

  const documentId = requireParamId(params.documentId, '/board/documents')
  const versionId = requireParamId(params.versionId, '/board/documents')

  const session = await getSession(request.headers.get('Cookie'))
  // Back to the history, saying why: a replacement used to delete the file it replaced.
  const unavailable = async () => {
    session.flash('error', m.board_versions_file_unavailable())
    return redirect(`/board/documents/${documentId}/edit?historique`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const owns = canUpload && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canReview && !owns) throw redirect('/board/documents')

    const file = await findVersionFile(db, { documentId, versionId, congregationId })
    if (file == null) return unavailable()

    const response = await getFileStream({ uri: file.uri, title: `${file.title} (v${file.versionNumber})` })
    return response ?? unavailable()
  })
}
