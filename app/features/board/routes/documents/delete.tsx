import { Form, redirect } from 'react-router'

import { deleteFile } from '~/features/board/server/document'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  const document = await db.boardDocument.findUnique({ where: { id: requireParamId(params.documentId, '/board') } })

  if (document == null) {
    throw redirect('/board/sections')
  }

  return { document }
}

export default function DeleteDocumentPage({ loaderData }: Route.ComponentProps) {
  const { document } = loaderData

  return (
    <div className="flex flex-col items-center justify-center gap-7 p-7">
      <p className="text-center">
        Êtes-vous sûr de vouloir supprimer le document "{document.title}" ? Cette action est irréversible.
      </p>
      <Form method="post">
        <button
          type="submit"
          title="Supprimer le document définitivement"
          className={'rounded-lg bg-red-600 p-3 font-semibold text-white hover:bg-red-900 max-sm:p-2'}
        >
          Supprimer le document
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser } = await verifySession(request)
  const canUploadDocument = await verifyRole(request, Role.BoardUploader)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  const document = await db.boardDocument.delete({ where: { id: requireParamId(params.documentId, '/board') } })

  try {
    await deleteFile(document)
  } catch (error) {
    logger.error('Document removal failed. Unexpected error during deletion of the file on the disk', { error })
  }

  session.flash('success', `Le document "${document.title}" a été correctement supprimé`)
  logger.info(`Document removed. User ID: ${currentUser.id}. Document ID: ${document.id}.`, { currentUser, document })
  return redirect('/board/documents', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
