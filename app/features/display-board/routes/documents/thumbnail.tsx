import { getBoardFileBuffer } from '~/features/display-board/server/document-storage.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/thumbnail'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { congregationId } = await authenticateAndAuthorize(request, [])

  return withScope(congregationId, async db => {
    const document = await db.boardDocument.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
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
