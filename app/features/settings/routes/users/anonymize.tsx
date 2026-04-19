import { redirect } from 'react-router'

import { Role } from '~/shared/types/role'
import { anonymizeUser } from '~/features/settings/server/anonymize-user.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/infra/db.server'
import logger from '~/shared/infra/logger.server'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/anonymize'

// Action-only route : anonymise un utilisateur (admin uniquement)
export async function action({ params, request }: Route.ActionArgs) {
  const { currentUser, can, congregationId } = await authenticateAndAuthorize(request, [Role.Admin])

  if (!can(Role.Admin)) {
    throw redirect('/')
  }

  const userId = requireParamId(params.userId, '/settings/users')

  // Empecher l'auto-anonymisation
  if (currentUser.id === userId) {
    throw redirect('/settings/users')
  }

  await withScope(congregationId, async db => {
    await anonymizeUser(db, userId, `admin:${currentUser.id}`)
  })

  logger.info(`Utilisateur anonymise. User ID: ${userId}. Par admin ID: ${currentUser.id}.`)
  audit({
    action: AuditAction.UserAnonymized,
    congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: userId,
  })

  return redirect('/settings/users')
}
