import { getBoardFileBuffer } from '~/features/display-board/server/document-storage.server'
import { buildSectionVisibilityFilter } from '~/features/display-board/server/section-visibility.server'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/thumbnail'

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.BoardViewer)

  return withScopeFromContext(context, async db => {
    const currentUser = context.get(currentAccountContext)
    const { congregationId } = currentUser
    // A thumbnail is a readable picture of the first page, so it needs the same
    // gate as the document — this route previously had none at all.
    const document = await db.boardDocument.findFirst({
      where: {
        id: requireParamId(params.documentId, '/board'),
        congregationId,
        section: await buildSectionVisibilityFilter(db, currentUser.id, congregationId),
      },
      select: { thumbnailUri: true },
    })

    if (!document?.thumbnailUri) {
      return new Response(null, { status: 404 })
    }

    const buffer = await getBoardFileBuffer(document.thumbnailUri)
    if (!buffer) {
      return new Response(null, { status: 404 })
    }

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  })
}
