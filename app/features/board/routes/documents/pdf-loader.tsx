import { redirect } from 'react-router'
import { verifySession } from '~/features/authentication/server/session.server'
import { getFileStream } from '~/features/board/server/document'
import { db, restoreCongregationContext } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/pdf-loader'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  logger.info(`Loading document ID: ${params.documentId}. User ID: ${currentUser.id}.`, { currentUser })

  restoreCongregationContext(currentUser.congregationId)
  const document = await db.boardDocument.update({
    where: {
      id: requireParamId(params.documentId, '/board'),
    },
    data: {
      viewedBy: {
        connect: {
          id: currentUser.id,
        },
      },
    },
  })

  if (!document) {
    logger.warn(`Document ID: ${params.documentId} does not exist. User ID: ${currentUser.id}.`, { currentUser })
    throw redirect('/board')
  }

  const response = await getFileStream(document)
  if (!response) {
    logger.warn(`File not found for document ID: ${document.id}.`, { document })
    throw redirect('/board')
  }

  return response
}
