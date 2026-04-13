import { Form, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { deleteFile } from '~/features/board/server/document'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'

import type { Route } from './+types/delete'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
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
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          {m.board_documents_delete_confirmation({ name: document.title })}
        </p>
        <Form method="post">
          <Button type="submit" variant="destructive" title={m.board_documents_delete_tooltip()}>
            {m.board_documents_delete_button()}
          </Button>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardUploader])
  const canUploadDocument = can(Role.BoardUploader)

  if (!canUploadDocument) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const document = await db.boardDocument.delete({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
      },
    })

    try {
      await deleteFile(document)
    } catch (error) {
      logger.error('Document removal failed. Unexpected error during deletion of the file on the disk', { error })
    }

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
