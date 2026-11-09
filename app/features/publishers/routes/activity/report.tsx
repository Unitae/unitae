import { parseWithZod } from '@conform-to/zod/v4'
import { data } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { reportTypeForMonth } from '~/features/publishers/model/activity-report-type'
import { reportAccess } from '~/features/publishers/model/group-activity-access'
import type { ReportPanelMonth } from '~/features/publishers/model/report-panel.type'
import {
  type ReportActionInput,
  reportActionSchema,
  reportQuerySchema,
} from '~/features/publishers/schemas/activity.schema'
import {
  createPublisherActivity,
  deletePublisherActivity,
  updatePublisherActivity,
} from '~/features/publishers/server/publisher-activity-mutations.server'
import { getReportPanelData } from '~/features/publishers/server/report-panel.queries'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import type { TransactionClient } from '~/shared/infra/db.server'
import { PublisherType } from '~/shared/types/publisher-type'
import { formatPersonName } from '~/shared/utils/format-person-name'

import type { Route } from './+types/report'

// The report panel's data route, shared by the activity page and the group page: one publisher's month to read, and
// its report to file, change or delete. The loader and the action ask the same access rule, so a group overseer
// reads and saves his own group's reports only, and only the secretary sees the credit.

function leaderOf(member: { responsibleFor?: { id: number } | null; deputyFor?: { id: number } | null } | null) {
  return member == null
    ? null
    : { responsibleForId: member.responsibleFor?.id ?? null, deputyForId: member.deputyFor?.id ?? null }
}

export function loader({ request, context }: Route.LoaderArgs) {
  const query = reportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return data({ ok: false as const, reason: 'invalid' as const }, { status: 400 })

  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  return withScopeFromContext(context, async (db, congregationId) => {
    const panel = await getReportPanelData(db, congregationId, query.data)
    if (panel == null) return data({ ok: false as const, reason: 'not-found' as const }, { status: 404 })

    const access = reportAccess({
      permissions,
      leader: leaderOf(currentUser.member),
      publisherGroupId: panel.publisher.groupId,
    })
    if (!(panel.report == null ? access.canRecord : access.canCorrect)) {
      return data({ ok: false as const, reason: 'forbidden' as const }, { status: 403 })
    }

    return {
      ok: true as const,
      ...panel,
      // Group overseers never see the credit: they describe the month in the observations, the secretary grants it.
      report: panel.report && { ...panel.report, creditHours: access.canGrantCredit ? panel.report.creditHours : null },
      canGrantCredit: access.canGrantCredit,
      canDelete: access.canDelete && panel.report != null,
    }
  })
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const submission = parseWithZod(await request.formData(), { schema: reportActionSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const input = submission.value

  return withScopeFromContext(context, async (db, congregationId) => {
    const panel = await getReportPanelData(db, congregationId, input)
    const access =
      panel &&
      reportAccess({ permissions, leader: leaderOf(currentUser.member), publisherGroupId: panel.publisher.groupId })
    const refused = () => data(submission.reply({ formErrors: [m.report_panel_error_forbidden()] }), { status: 403 })
    if (panel == null || access == null) return refused()

    const name = formatPersonName(panel.publisher)
    const session = await getSession(request.headers.get('Cookie'))
    const saved = async (message: string) => {
      session.flash('success', message)
      return data({ ok: true as const }, { headers: { 'Set-Cookie': await commitSession(session) } })
    }

    if (input.intent === 'delete') {
      if (!access.canDelete || panel.report == null) return refused()
      await deletePublisherActivity(db, panel.report.id, congregationId, currentUser.id)
      return saved(m.activity_delete_success({ name }))
    }

    if (!(panel.report == null ? access.canRecord : access.canCorrect)) return refused()
    return saved(
      await saveReport(db, {
        panel,
        input,
        canGrantCredit: access.canGrantCredit,
        congregationId,
        actorId: currentUser.id,
      }),
    )
  })
}

interface SaveReportInput {
  panel: ReportPanelMonth
  input: Extract<ReportActionInput, { intent: 'save' }>
  canGrantCredit: boolean
  congregationId: number
  actorId: number
}

/** Files the month's report or changes the filed one, and says so in the words of the flash message. */
async function saveReport(
  db: TransactionClient,
  { panel, input, canGrantCredit, congregationId, actorId }: SaveReportInput,
) {
  const name = formatPersonName(panel.publisher)
  // The enrolment covering the month decides the type, whatever was submitted; without one, the panel's choice.
  const type = reportTypeForMonth(panel.enrolment, input.type)
  const fields = {
    type,
    isPublisher: input.hours > 0 ? true : input.preached,
    hours: input.hours,
    studies: input.studies,
    notes: input.observations,
  }
  // Only pioneers count their hours, so only their reports carry a credit; a « Normal » month clears it. Without the
  // right to grant it, the credit is left out entirely: a server-side gate, not just a hidden field.
  const credit = type === PublisherType.Normal ? null : (input.creditHours ?? null)
  const creditField = canGrantCredit ? { creditHours: credit } : {}

  if (panel.report == null) {
    await createPublisherActivity(db, {
      ...fields,
      ...creditField,
      publisherId: panel.publisher.id,
      month: input.month,
      year: input.year,
      congregationId,
      actorId,
    })
    return m.activity_new_success({ name })
  }

  await updatePublisherActivity(db, panel.report.id, congregationId, actorId, { ...fields, ...creditField })
  const cleared = canGrantCredit && panel.report.creditHours != null && credit == null
  return cleared
    ? m.activity_edit_success_credit_cleared({ name, hours: panel.report.creditHours ?? 0 })
    : m.activity_edit_success({ name })
}
