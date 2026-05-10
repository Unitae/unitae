import { redirect, redirectDocument } from 'react-router'

import { destroySession, getSession } from '~/features/authentication/server/session.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb } from '~/shared/infra/db.server'

import type { Route } from './+types/logout'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))

  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)
  if (rawUserId && !Number.isNaN(userId) && userId > 0) {
    const user = await unscopedDb.userAccount.findUnique({ where: { id: userId }, select: { congregationId: true } })
    if (user) {
      audit({
        action: AuditAction.UserLogout,
        congregationId: user.congregationId,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
      })
    }
  }

  return redirectDocument('/', {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  })
}
