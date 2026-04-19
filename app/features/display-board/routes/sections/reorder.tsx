import { redirect } from 'react-router'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/libs/route-context.server'
import { Role } from '~/shared/types/role'

import type { Route } from './+types/reorder'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/board/sections')
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  if (!permissions.has(Role.BoardValidator)) {
    throw redirect('/')
  }

  const { orderedIds } = (await request.json()) as { orderedIds: number[] }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false }
  }

  return withScopeFromContext(context, async db => {
    const { congregationId } = context.get(userContext)
    await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1, $2)', 1_000_001, congregationId)

    for (let i = 0; i < orderedIds.length; i++) {
      await db.boardSection.update({
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
