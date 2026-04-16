import { redirect } from 'react-router'
import { Role } from '~/features/authorization/model/roles.type'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'

import type { Route } from './+types/reorder'

type OrderedItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.BoardValidator])

  if (!can(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedItems } = (await request.json()) as { orderedItems: OrderedItem[] }

  if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
    return { ok: false }
  }

  return withScope(congregationId, async db => {
    // Serialize concurrent reorders on documents — lock on first item id to avoid interleaving
    await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_000, orderedItems[0].id)

    for (let i = 0; i < orderedItems.length; i++) {
      const item = orderedItems[i]
      if (item.kind === 'pdf') {
        await db.boardDocument.update({
          where: {
            // biome-ignore lint/style/useNamingConvention: prisma compound key
            id_congregationId: { id: item.id, congregationId },
          },
          data: { order: i * 5 },
        })
      } else {
        await db.boardDynamicDocumentSettings.update({
          where: {
            // biome-ignore lint/style/useNamingConvention: prisma compound key
            id_congregationId: { id: item.id, congregationId },
          },
          data: { order: i * 5 },
        })
      }
    }

    return { ok: true }
  })
}
