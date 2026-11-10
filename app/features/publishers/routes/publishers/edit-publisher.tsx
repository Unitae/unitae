import { parseWithZod } from '@conform-to/zod/v4'
import { FormSection } from '@unitae/ui'
import { useState } from 'react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { getEnrolmentsForMember } from '~/features/publishers/index.server'
import { toRecordEnrolments } from '~/features/publishers/model/publisher-record'
import { publisherFormSchema } from '~/features/publishers/schemas/publisher.schema'
import { getPublisherRecord } from '~/features/publishers/server/publisher-record.queries'
import { updateMember } from '~/features/publishers/server/update-member.server'
import { periodLabel, serviceLabel } from '~/features/publishers/ui/enrolment-labels'
import { PublisherForm } from '~/features/publishers/ui/PublisherForm'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'
import { zonedNow } from '~/shared/utils/zoned-now'

import type { Route } from './+types/edit-publisher'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData ? `${m.publishers_record_edit()} · ${formatPersonName(loaderData.publisher)} - Unitae` : 'Unitae',
  },
]

// The publisher's edit page: who they are, how to reach them, their group and their baptism, saved together. Their
// status, login and pioneer service are changed from the record, each on its own.
export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublishers)
  const now = zonedNow(context.get(congregationContext).timezone)

  return withScopeFromContext(context, async (db, congregationId) => {
    const memberId = requireParamId(params.publisherId, '/publishers')
    const publisher = await getPublisherRecord(db, memberId, congregationId, { withLogin: true })
    if (publisher == null) throw redirect('/publishers')
    const [groups, enrolments] = await Promise.all([
      db.publisherGroup.findMany({
        where: { congregationId },
        select: { id: true, name: true, responsibleId: true, deputyId: true },
        orderBy: { name: 'asc' },
      }),
      getEnrolmentsForMember(db, memberId, congregationId),
    ])
    const current = toRecordEnrolments(enrolments, { month: now.getMonth(), year: now.getFullYear() }).find(
      enrolment => enrolment.current,
    )
    // A group's overseer and assistant stay in the group they lead: the form says so instead of offering a move.
    const led = groups.find(group => group.responsibleId === memberId || group.deputyId === memberId)
    return {
      publisher,
      groups: groups.map(({ id, name }) => ({ id, name })),
      ledGroup: led ? { id: led.id, name: led.name } : null,
      current: current ?? null,
    }
  })
}

export default function EditPublisher({ loaderData, actionData }: Route.ComponentProps) {
  const { publisher, groups, ledGroup, current } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()
  const [version, setVersion] = useState(0)
  const name = formatPersonName(publisher)
  const record = `/publishers/${publisher.id}/view`

  return (
    <div className="flex flex-col">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={name}
        subtitle={m.publishers_edit_page_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_publishers(), to: '/publishers' },
          { label: name, to: record },
          { label: m.publishers_record_edit() },
        ]}
      />
      <PublisherForm
        key={version}
        values={{ ...publisher, publisherGroupId: publisher.group?.id ?? null }}
        groups={groups}
        ledGroup={ledGroup}
        loginEmail={publisher.login?.email}
        actionData={actionData}
        onDirtyChange={setDirty}
        after={
          <FormSection title={m.pioneers_detail_title()} description={m.publishers_form_pioneer_hint()}>
            <div className="col-span-full flex flex-col gap-1.5 rounded-md bg-sidebar px-3.5 py-3 text-sm">
              <span className="font-medium">
                {current
                  ? `${serviceLabel(current.mode)} · ${periodLabel(current)}`
                  : m.publishers_record_enrolment_none()}
              </span>
              <p className="text-muted-foreground">{m.publishers_form_pioneer_where()}</p>
              <Link to={`${record}#activity`} className="self-start text-brand-text hover:underline">
                {m.publishers_form_pioneer_open()}
              </Link>
            </div>
          </FormSection>
        }
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setVersion(value => value + 1)}>
              {m.common_cancel()}
            </Button>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </>
        }
      />
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublishers)
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: publisherFormSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })

  const { birthDate, baptismDate, arrivedAt, group, email, ...fields } = submission.value
  let user: Awaited<ReturnType<typeof updateMember>>
  try {
    user = await withScopeFromContext(context, db =>
      updateMember(db, requireParamId(params.publisherId, '/publishers'), currentUser.congregationId, currentUser.id, {
        ...fields,
        birthDate: birthDate || null,
        baptismDate: baptismDate || null,
        arrivedAt: arrivedAt || null,
        groupId: group ?? null,
        email: email ?? '',
      }),
    )
  } catch (error) {
    // A group's overseer or assistant moved out of the group they lead (a stale page): said on the group field.
    if (error instanceof ConflictError) {
      return data(submission.reply({ fieldErrors: { group: [error.message] } }), { status: 409 })
    }
    throw error
  }
  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.publishers_edit_success({ name: formatPersonName(user) }))
  // Back to the record the edit started from: the save is done, and the page to read it on is there.
  return redirect(`/publishers/${user.id}/view`, { headers: { 'Set-Cookie': await commitSession(session) } })
}
