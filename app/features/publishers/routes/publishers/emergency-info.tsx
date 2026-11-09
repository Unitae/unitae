import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { canManageEmergencyInfo, canViewEmergencyInfo } from '~/features/publishers/model/emergency-access'
import { updateEmergencyInfoSchema } from '~/features/publishers/schemas/emergency-info.schema'
import { getEmergencyInfoForMember } from '~/features/publishers/server/emergency.queries'
import { updateEmergencyInfo } from '~/features/publishers/server/emergency-info.aggregate'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import { Permission } from '~/shared/types/permission'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/emergency-info'

// The emergency panel's data route, opened from the publisher record and from the group page's siren: one person's
// emergency information to read, and to change for those who may. A refusal answers with data, never a redirect, so the
// panel stays on its page and says so.

function access(permissions: Set<Permission>, account: SanitizedAccount, targetGroupId: number | null) {
  return {
    hasViewer: permissions.has(Permission.CanViewEmergencyInfo),
    hasManager: permissions.has(Permission.CanManageEmergencyInfo),
    myResponsibleGroupId: account.member?.responsibleFor?.id ?? null,
    myDeputyGroupId: account.member?.deputyFor?.id ?? null,
    targetGroupId,
  }
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const account = context.get(currentAccountContext)
  const memberId = requireParamId(params.publisherId, '/publishers')

  return withScopeFromContext(context, async (db, congregationId) => {
    const info = await getEmergencyInfoForMember(db, memberId, congregationId)
    if (info == null) return data({ ok: false as const, reason: 'not-found' as const }, { status: 404 })
    const rights = access(permissions, account, info.publisherGroupId)
    if (!canViewEmergencyInfo(rights))
      return data({ ok: false as const, reason: 'forbidden' as const }, { status: 403 })

    return {
      ok: true as const,
      name: formatPersonName(info),
      dpaCardUpToDate: info.dpaCardUpToDate,
      survivalBackpackReady: info.survivalBackpackReady,
      emergencyContacts: info.emergencyContacts,
      canManage: canManageEmergencyInfo(rights),
    }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const account = context.get(currentAccountContext)
  const memberId = requireParamId(params.publisherId, '/publishers')
  const submission = parseWithZod(await request.formData(), { schema: updateEmergencyInfoSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  return withScopeFromContext(context, async (db, congregationId) => {
    const info = await getEmergencyInfoForMember(db, memberId, congregationId)
    if (info == null || !canManageEmergencyInfo(access(permissions, account, info.publisherGroupId))) {
      return data(submission.reply({ formErrors: [m.publishers_emergency_error_forbidden()] }), { status: 403 })
    }
    await updateEmergencyInfo(db, memberId, congregationId, account.id, submission.value)

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_emergency_success())
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
