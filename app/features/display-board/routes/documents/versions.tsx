import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { restoreVersionSchema } from '~/features/display-board/schemas/board-document.schema'
import { isDocumentOwnedByUploader } from '~/features/display-board/server/board-document.server'
import { restoreDocumentVersion } from '~/features/display-board/server/document-versions.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/versions'

// The history opens beside the document's form now; this route keeps the address, and brings a version back.
export function loader({ params }: Route.LoaderArgs) {
  throw redirect(`/board/documents/${requireParamId(params.documentId, '/board/documents')}/edit?historique`)
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
  const documentId = requireParamId(params.documentId, '/board/documents')
  const history = `/board/documents/${documentId}/edit?historique`
  const submission = parseWithZod(await request.formData(), { schema: restoreVersionSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  return withScopeFromContext(context, async db => {
    const ownsDocument = canUploadDocument && (await isDocumentOwnedByUploader(db, documentId, currentUser.id))
    if (!canManageBoard && !ownsDocument) throw redirect('/board/documents')

    const result = await restoreDocumentVersion(
      db,
      documentId,
      submission.value.versionId,
      currentUser.congregationId,
      currentUser.id,
    )
    session.flash(
      result == null ? 'error' : 'success',
      result == null
        ? m.board_versions_restore_unavailable()
        : m.board_versions_restore_success({ version: result.versionNumber }),
    )
    return redirect(history, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
