import { redirect } from 'react-router'
import { anonymizeUser } from '~/features/settings/server/anonymize-user.server'
import { permissionsContext, requirePermission, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { AuditAction, audit } from '~/shared/domain/audit.server'
import logger from '~/shared/infra/logger.server'
import type { UserId } from '~/shared/types/branded'
import { Permission } from '~/shared/types/permission'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/anonymize'

// Action-only route : anonymise un utilisateur (admin uniquement)
export async function action({ params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const congregationId = currentUser.congregationId

  requirePermission(permissions, Permission.Admin)

  const userId = requireParamId<UserId>(params.userId, '/settings/users')

  // Empecher l'auto-anonymisation
  if (currentUser.id === userId) {
    throw redirect('/settings/users')
  }

  await withScopeFromContext(context, async db => {
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
