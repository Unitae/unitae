import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'

import type { Route } from './+types/reorder'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScope(congregationId, async db => {
    // Serialize concurrent reorders on documents
    await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_000, orderedIds[0])

    for (let i = 0; i < orderedIds.length; i++) {
      await db.boardDocument.update({
        where: {
          // biome-ignore lint/style/useNamingConvention: prisma compound key
          id_congregationId: { id: orderedIds[i], congregationId },
        },
        data: { order: i * 5 },
      })
    }

    return { ok: true }
  })
}
