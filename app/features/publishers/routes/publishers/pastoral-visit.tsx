import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { memberAggregate } from '~/features/publishers/index.server'
import {
  canRecordPastoralVisit,
  type PastoralVisitAccessInput,
} from '~/features/publishers/model/pastoral-visit-access'
import { pastoralVisitSchema } from '~/features/publishers/schemas/pastoral-visit.schema'
import { getPastoralVisitForMember } from '~/features/publishers/server/pastoral-visit.queries'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import type { SanitizedAccount } from '~/shared/auth/sanitize-account.server'
import { Permission } from '~/shared/types/permission'
import { formatDateForInput } from '~/shared/utils/event-time'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'

import { memberPanelPath } from './_member-back-path.server'
import type { Route } from './+types/pastoral-visit'

// A pastoral visit is noted in a small dialog now, on the member's record or on their group's page; it posts here and
// stays open on a refusal. An old link to this page opens that dialog where it lives.

function accessInput(
  permissions: Set<Permission>,
  account: SanitizedAccount,
  targetGroupId: number | null,
): PastoralVisitAccessInput {
  return {
    hasPublisherViewer: permissions.has(Permission.CanViewPublishers),
    hasPublisherManager: permissions.has(Permission.CanManagePublishers),
    myResponsibleGroupId: account.member?.responsibleFor?.id ?? null,
    myDeputyGroupId: account.member?.deputyFor?.id ?? null,
    targetGroupId,
  }
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const memberId = requireParamId(params.publisherId, '/publishers')

  return withScopeFromContext(context, async (db, congregationId) => {
    const member = await getPastoralVisitForMember(db, memberId, congregationId)
    if (member == null) throw redirect('/')
    throw redirect(memberPanelPath(request, permissions, member, 'visit'))
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const account = context.get(currentAccountContext)
  const memberId = requireParamId(params.publisherId, '/publishers')
  const { timezone } = context.get(congregationContext)

  const submission = parseWithZod(await request.formData(), { schema: pastoralVisitSchema })
  if (submission.status !== 'success') {
    return data(submission.reply({ formErrors: [m.publishers_visit_error_date()] }), { status: 400 })
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const member = await getPastoralVisitForMember(db, memberId, congregationId)
    if (member == null || !canRecordPastoralVisit(accessInput(permissions, account, member.publisherGroupId))) {
      return data(submission.reply({ formErrors: [m.publishers_visit_error_forbidden()] }), { status: 403 })
    }

    const { value } = submission
    // A visit is recorded once it happened: not later than today on the congregation's calendar.
    if (value.intent === 'save' && value.visitedOn > formatDateForInput(new Date(), timezone)) {
      return data(submission.reply({ formErrors: [m.publishers_visit_error_future()] }), { status: 400 })
    }

    const visitedOn = value.intent === 'save' ? new Date(`${value.visitedOn}T00:00:00Z`) : null
    await memberAggregate.setLastPastoralVisit(db, member.id, congregationId, visitedOn, account.id)

    const session = await getSession(request.headers.get('Cookie'))
    const name = formatPersonName(member)
    session.flash('success', visitedOn ? m.publishers_visit_saved({ name }) : m.publishers_visit_cleared({ name }))
    return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
  })
}
