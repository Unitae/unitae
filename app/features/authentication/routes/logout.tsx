import { redirect, redirectDocument } from 'react-router'

import { endCurrentSessions } from '~/features/authentication/server/revoke-account-sessions.server'
import { destroySession, getSession } from '~/features/authentication/server/session.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { unscopedDb } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'

import type { Route } from './+types/logout'

export function loader(_args: Route.LoaderArgs) {
  throw redirect('/')
}

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get('Cookie'))

  const rawUserId = session.get('userId')
  const userId = Number(rawUserId)
  if (rawUserId && !Number.isNaN(userId) && userId > 0) {
    // End the session server-side: the cookie is signed but stateless, so clearing it in this
    // browser would leave any copy of it valid. Bumping the epoch invalidates every session of the
    // account, on every device, but only when this cookie is itself still a valid session.
    try {
      if (await endCurrentSessions(userId, Number(session.get('sessionEpoch') ?? 0))) {
        const user = await unscopedDb.userAccount.findUnique({
          where: { id: userId },
          select: { congregationId: true },
        })
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
    } catch (error) {
      // The user asked to leave this device: clear the cookie anyway, but make the failure visible,
      // since copies of the cookie stay valid until the sessions are ended.
      logger.error('Could not end the sessions server-side on logout; the cookie is cleared anyway', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return redirectDocument('/', {
    headers: {
      'Set-Cookie': await destroySession(session),
    },
  })
}
