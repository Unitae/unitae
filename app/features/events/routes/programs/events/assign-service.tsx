import { parseWithZod } from '@conform-to/zod'
import { useState } from 'react'
import { data, Form, redirect, useSearchParams } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { assignServiceSchema } from '~/features/events/schemas/assign-service.schema'
import {
  getServiceRoleAssignmentAllowedRoleIds,
  resolveEligibleUserIds,
} from '~/features/events/server/allowed-roles.server'
import { assignServiceRole, getEventProgramme } from '~/features/events/server/programme-assignments.server'
import { canEditEvent } from '~/features/events/server/programme-auth.server'
import { PublisherInfoCard } from '~/features/events/ui/PublisherInfoCard'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import logger from '~/shared/infra/logger.server'
import type { Permission } from '~/shared/types/permission'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatEventDate } from '~/shared/utils/event-time'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/assign-service'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.programs_assign_service_meta_title() }]
}

export function loader({ request, params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)

  const eventId = requireParamId(params.eventId, '/programs')
  const url = new URL(request.url)
  const assignmentId = Number(url.searchParams.get('assignmentId'))

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await getEventProgramme(db, eventId, congregationId)
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const assignment = event.serviceRoleAssignments.find(a => a.id === assignmentId)

    const users = await db.member.findMany({
      where: { congregationId, leftAt: null },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    })
    const userById = new Map(users.map(u => [u.id, u]))

    let assigneeCandidates = users
    if (assignment) {
      const allowed = await getServiceRoleAssignmentAllowedRoleIds(db, assignment.id, congregationId)
      const eligible = await resolveEligibleUserIds(db, allowed, congregationId)
      assigneeCandidates = eligible.map(id => userById.get(id)).filter((u): u is (typeof users)[number] => u != null)
    }

    return { event, assignment, assigneeCandidates, timezone: context.get(congregationContext).timezone }
  })
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const session = await getSession(request.headers.get('Cookie'))

  const eventId = requireParamId(params.eventId, '/programs')
  const submission = parseWithZod(await request.formData(), { schema: assignServiceSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { assignmentId, assigneeId } = submission.value

  return withScopeFromContext(context, async db => {
    const { congregationId } = currentUser
    const can = (role: Permission) => permissions.has(role)
    const event = await db.event.findFirst({ where: { id: eventId, congregationId } })
    if (!event) throw redirect('/programs')

    if (!(await canEditEvent(db, can, currentUser.id, event.templateId ?? null, congregationId))) {
      throw redirect('/programs')
    }

    const result = await assignServiceRole(db, assignmentId, assigneeId, congregationId)

    if ('error' in result && result.error) {
      session.flash('error', result.error)
      logger.warn(`Service role assignment conflict. User ID: ${currentUser.id}. Event: ${eventId}.`)
    } else {
      session.flash('success', m.programs_assign_service_success())
      logger.info(`Assigned service role. User ID: ${currentUser.id}. Event: ${eventId}.`)
    }

    return data(
      { ok: !('error' in result && result.error) },
      { headers: { 'Set-Cookie': await commitSession(session) } },
    )
  })
}

export default function AssignServicePage({ loaderData }: Route.ComponentProps) {
  const { event, assignment, assigneeCandidates, timezone } = loaderData
  const [params] = useSearchParams()
  const [selectedAssignee, setSelectedAssignee] = useState(assignment?.assigneeId?.toString() ?? '')
  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.programs_assign_service_page_title()}
        subtitle={`${event.name} — ${formatEventDate(event.startDate, timezone, 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        breadcrumbs={[
          { label: m.sidebar_programs(), to: '/programs' },
          { label: m.programs_assign_service_page_title() },
        ]}
        backTo={`/programs/events/${event.id}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{assignment?.name ?? m.programs_assign_service_default()}</CardTitle>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4" onChange={markDirty}>
              <input type="hidden" name="assignmentId" value={params.get('assignmentId') ?? ''} />

              <div className="flex flex-col gap-2">
                <Label htmlFor="assigneeId">{m.programs_assign_service_publisher_label()}</Label>
                <PersonDropdown
                  id="assigneeId"
                  name="assigneeId"
                  people={assigneeCandidates}
                  value={selectedAssignee}
                  onValueChange={setSelectedAssignee}
                  placeholder={m.programs_assign_service_select_publisher()}
                  noneLabel={m.programs_assign_service_none()}
                />
              </div>

              <SubmitButton className="w-fit">{m.common_save()}</SubmitButton>
            </Form>
          </CardContent>
        </Card>

        <PublisherInfoCard eventId={event.id} userId={selectedAssignee} partName={assignment?.name} />
      </div>
    </div>
  )
}
