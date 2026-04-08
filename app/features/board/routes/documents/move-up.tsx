import { redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/move-up'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session } = await verifySession(request)
  const canManageBoard = await verifyRole(request, Role.BoardValidator)

  if (!canManageBoard) {
    throw redirect('/')
  }

  const currentDocument = await db.boardDocument.findUnique({
    where: { id: requireParamId(params.documentId, '/board') },
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
    where: { sectionId: currentDocument?.sectionId },
  })
  const orderedDocuments = documents
    .map((document, index) => ({
      id: document.id,
      order: index * 5 - (document.id === currentDocument.id ? 7.5 : 0),
    }))
    .sort((a, b) => a.order - b.order)
    .map((document, index) => ({
      id: document.id,
      order: index * 5,
    }))

  for (const document of orderedDocuments) {
    await db.boardDocument.update({
      where: { id: document.id },
      data: { order: document.order },
    })
  }

  session.flash('success', `La section "${currentDocument.title}" a été correctement déplacée vers le haut`)

  return redirect('/board/documents', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
