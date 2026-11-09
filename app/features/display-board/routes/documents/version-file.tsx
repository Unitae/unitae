import { redirect } from 'react-router'
import { isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { getFileStream } from '~/features/display-board/server/document.server'
import { findVersionFile } from '~/features/display-board/server/document-form.queries'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/version-file'

/**
 * One version's own file, from the document's history. Guarded as the edit page is: a reviewer, or
 * the uploader of the document.
 */
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canUpload = permissions.has(Permission.CanUploadBoardDocuments)
  const canReview = permissions.has(Permission.CanReviewBoardDocuments)
  if (!canUpload && !canReview) throw redirect('/')

  const documentId = requireParamId(params.documentId, '/board/documents')
  const versionId = requireParamId(params.versionId, '/board/documents')

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const owns = canUpload && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canReview && !owns) throw redirect('/board/documents')

    const file = await findVersionFile(db, { documentId, versionId, congregationId })
    if (file == null) throw redirect(`/board/documents/${documentId}/edit`)

    const response = await getFileStream({ uri: file.uri, title: `${file.title} (v${file.versionNumber})` })
    if (response == null) throw redirect(`/board/documents/${documentId}/edit`)
    return response
  })
}
