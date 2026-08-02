import { parseWithZod } from '@conform-to/zod'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import {
  canManageEmergencyInfo,
  canViewEmergencyInfo,
  type EmergencyAccessInput,
} from '~/features/publishers/model/emergency-access'
import { updateEmergencyInfoSchema } from '~/features/publishers/schemas/emergency-info.schema'
import { getEmergencyInfoForMember } from '~/features/publishers/server/emergency.queries'
import { updateEmergencyInfo } from '~/features/publishers/server/emergency-info.aggregate'
import EmergencyInfoView from '~/features/publishers/ui/EmergencyInfoView'
import PublisherEmergencyForm from '~/features/publishers/ui/PublisherEmergencyForm'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { PageHeader } from '~/shared/ui/PageHeader'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/emergency'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_emergency_meta_title() }]
}

function accessInput(
  permissions: Set<Permission>,
  currentUser: SanitizedAccount,
  targetGroupId: number | null,
): EmergencyAccessInput {
  return {
    hasViewer: permissions.has(Permission.EmergencyInfoViewer),
    hasManager: permissions.has(Permission.EmergencyInfoManager),
    myResponsibleGroupId: currentUser.member?.responsibleFor?.id ?? null,
    myDeputyGroupId: currentUser.member?.deputyFor?.id ?? null,
    targetGroupId,
  }
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const publisherId = requireParamId(params.publisherId, '/publishers')

  return withScopeFromContext(context, async db => {
    const info = await getEmergencyInfoForMember(db, publisherId, currentUser.congregationId)
    if (info == null) throw redirect('/publishers')

    const access = accessInput(permissions, currentUser, info.publisherGroupId)
    if (!canViewEmergencyInfo(access)) throw redirect('/')

    return { info, canManage: canManageEmergencyInfo(access) }
  })
}

export default function EmergencyPage({ loaderData, actionData }: Route.ComponentProps) {
  const { info, canManage } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.publishers_emergency_title()}
        subtitle={m.publishers_emergency_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_publishers(), to: '/publishers' },
          { label: `${info.firstname} ${info.lastname}`, to: `/publishers/${info.id}/view` },
          { label: m.publishers_emergency_title() },
        ]}
        backTo={`/publishers/${info.id}/view`}
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.publishers_emergency_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <PublisherEmergencyForm info={info} lastResult={actionData} />
          ) : (
            <EmergencyInfoView info={info} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const publisherId = requireParamId(params.publisherId, '/publishers')

  const submission = parseWithZod(await request.formData(), { schema: updateEmergencyInfoSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  return withScopeFromContext(context, async db => {
    const info = await getEmergencyInfoForMember(db, publisherId, currentUser.congregationId)
    if (info == null) throw redirect('/publishers')

    const access = accessInput(permissions, currentUser, info.publisherGroupId)
    if (!canManageEmergencyInfo(access)) throw redirect('/')

    await updateEmergencyInfo(db, publisherId, currentUser.congregationId, currentUser.id, submission.value)

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_emergency_success())
    return redirect(`/publishers/${publisherId}/emergency`, {
      headers: { 'Set-Cookie': await commitSession(session) },
    })
  })
}
