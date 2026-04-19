import { redirect } from 'react-router'
import { Role } from '~/shared/types/role'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'

import type { Route } from './+types/reorder'

type OrderedItem = { kind: 'pdf' | 'dyn'; id: number }

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/documents')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedItems } = (await request.json()) as { orderedItems: OrderedItem[] }

  if (!Array.isArray(orderedItems) || orderedItems.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
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
