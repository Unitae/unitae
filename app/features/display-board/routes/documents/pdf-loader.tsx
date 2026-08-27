import { redirect } from 'react-router'
import { getFileStream } from '~/features/display-board/server/document.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'
import type { Route } from './+types/pdf-loader'

export const meta: Route.MetaFunction = () => {
  return [{ title: `Tableau d'affichage - Unitae` }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanViewBoard)

  const currentUser = context.get(currentAccountContext)
  logger.info(`Loading document ID: ${params.documentId}. User ID: ${currentUser.id}.`, { currentUser })

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    // The bytes themselves, so the visibility filter matters more here than on
    // the page that links to them.
    const document = await db.boardDocument.findFirst({
      where: {
        id: requireParamId(params.documentId, '/board'),
        congregationId,
        section: await buildSectionVisibilityFilter(db, currentUser.id, congregationId),
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

    logger.info(
      `Document ID: ${params.documentId} delivered. Status: ${response.status}. Type: ${response.headers.get('Content-Type')}.`,
      { documentId: params.documentId, userId: currentUser.id },
    )

    return response
  })
}
