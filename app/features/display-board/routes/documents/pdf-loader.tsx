import { redirect } from 'react-router'
import { getFileStream } from '~/features/display-board/server/document.server'
import logger from '~/shared/infra/logger.server'
import { userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/pdf-loader'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext)
  logger.info(`Loading document ID: ${params.documentId}. User ID: ${currentUser.id}.`, { currentUser })

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
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
