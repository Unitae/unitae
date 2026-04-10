import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { deleteFile } from '~/features/board/server/document'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, db } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

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
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          Êtes-vous sûr de vouloir supprimer le document "{document.title}" ? Cette action est irréversible.
        </p>
        <Form method="post">
          <Button type="submit" variant="destructive" title="Supprimer le document définitivement">
            Supprimer le document
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, can, db } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

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
