import ResetPasswordRequired from 'emails/reset-password-required'
import { redirect } from 'react-router'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { audit, AuditAction } from '~/shared/libs/audit.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { resolveCongregation } from '~/shared/libs/congregation.server'
import { unscopedDb as db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import type { Route } from './+types/password-invalidation'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Unitae' }]
}

export function loader() {
  throw redirect('/')
}

export async function action({ request, params }: Route.ActionArgs) {
  const { session, currentUser, can } = await authenticateAndAuthorize(request, [Role.SettingsUserManager])
  const canManageUser = can(Role.SettingsUserManager)

  if (!canManageUser) throw redirect('/')

  const user = await db.user.findUnique({
    where: { id: requireParamId(params.userId, '/settings/users') },
  })

  if (user == null) throw redirect('/settings/users')

  const token = await createPasswordResetToken(user.id)
  const congregation = await resolveCongregation(user.congregationId)
  await sendResetUserPasswordEmail(
    user.id,
    <ResetPasswordRequired
      email={user.email}
      firstname={user.firstname || undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )
  audit({
    action: AuditAction.PasswordResetRequested,
    congregationId: user.congregationId,
    actorId: currentUser.id,
    entityType: 'User',
    entityId: user.id,
  })

  session.flash('success', `Le mot de passe de ${user.email} a été réinitialisé`)

  return redirect(`/settings/users/${user.id}/edit`, {
    headers: { 'Set-Cookie': await commitSession(session) },
  })
}
