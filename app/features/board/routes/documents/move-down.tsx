import { redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/move-down'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])
  const canManageBoard = can(Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const currentDocument = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
      },
    })

    if (currentDocument == null) {
      session.flash('error', `Le document n'existe pas`)
      return redirect('/board/documents', {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    }

    const documents = await db.boardDocument.findMany({
      orderBy: { order: 'asc' },
      where: { sectionId: currentDocument?.sectionId, congregationId },
    })
    const orderedDocuments = documents
      .map((document, index) => ({
        id: document.id,
        order: index * 5 + (document.id === currentDocument.id ? 7.5 : 0),
      }))
      .sort((a, b) => a.order - b.order)
      .map((document, index) => ({
        id: document.id,
        order: index * 5,
      }))

    for (const document of orderedDocuments) {
      await db.boardDocument.update({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: document.id, congregationId },
        },
        data: { order: document.order },
      })
    }

    session.flash('success', `La section "${currentDocument.title}" a été correctement déplacée vers le bas`)

    return redirect('/board/documents', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
