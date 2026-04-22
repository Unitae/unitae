import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { deleteBoardDocument } from '~/features/display-board/server/board-document.server'
import { deleteAllVersionFiles } from '~/features/display-board/server/document-versions.server'
import * as m from '~/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent } from '~/shared/ui/card'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/delete'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardUploader)) {
    throw redirect('/')
  }

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
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center justify-center gap-6 pt-6">
        <p className="text-center text-muted-foreground">
          {m.board_documents_delete_confirmation({ name: document.title })}
        </p>
        <Form method="post">
          <SubmitButton variant="destructive" title={m.board_documents_delete_tooltip()}>
            {m.board_documents_delete_button()}
          </SubmitButton>
        </Form>
      </CardContent>
    </Card>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardUploader)) {
    throw redirect('/')
  }

  const currentUser = context.get(userContext)
  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const documentId = requireParamId(params.documentId, '/board')

    // Delete version files before cascade removes the rows
    await deleteAllVersionFiles(db, documentId)

    const document = await deleteBoardDocument(db, documentId, congregationId)

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
