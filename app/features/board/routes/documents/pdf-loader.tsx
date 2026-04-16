import { redirect } from 'react-router'
import { getFileStream } from '~/features/board/server/document'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import logger from '~/shared/libs/logger.server'
import { requireParamId } from '~/shared/libs/params.server'
import type { Route } from './+types/pdf-loader'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { currentUser, congregationId } = await authenticateAndAuthorize(request)
  logger.info(`Loading document ID: ${params.documentId}. User ID: ${currentUser.id}.`, { currentUser })

  return withScope(congregationId, async db => {
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
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
  })
}
