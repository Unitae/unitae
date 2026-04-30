import { getBoardFileBuffer } from '~/features/display-board/server/document-storage.server'
import { userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/thumbnail'

export function loader({ params, context }: Route.LoaderArgs) {
  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    const document = await db.boardDocument.findUnique({
      where: {
        id_congregationId: { id: requireParamId(params.documentId, '/board'), congregationId },
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
