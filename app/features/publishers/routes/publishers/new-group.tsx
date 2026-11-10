import { parseWithZod } from '@conform-to/zod/v4'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createGroupSchema } from '~/features/publishers/schemas/group.schema'
import { changeGroupMembers } from '~/features/publishers/server/group-members.server'
import { groupSaveRefusal } from '~/features/publishers/server/group-save-refusal.server'
import { findGroupLeaderCandidates, findGroupMemberCandidates } from '~/features/publishers/server/groups.server'
import { createPublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import { GroupForm } from '~/features/publishers/ui/GroupForm'
import * as m from '~/i18n/paraglide/messages'
import {
  currentAccountContext,
  permissionsContext,
  requirePermission,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatGroupName } from '~/shared/utils/format-group-name'

import type { Route } from './+types/new-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManagePublisherGroups)) throw redirect('/')

  return withScopeFromContext(context, async (db, congregationId) => {
    const [leaders, candidates] = await Promise.all([
      findGroupLeaderCandidates(db, congregationId),
      findGroupMemberCandidates(db, congregationId, null),
    ])
    return { leaders, candidates }
  })
}

export default function NewGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { leaders, candidates } = loaderData
  const { blocker, setDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.groups_new_title()}
        subtitle={m.groups_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups(), to: '/groups' }, { label: m.groups_new_title() }]}
      />

      <GroupForm
        leaders={leaders}
        members={[]}
        candidates={candidates}
        lastResult={actionData}
        onDirtyChange={setDirty}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/groups">{m.common_cancel()}</Link>
            </Button>
            <SubmitButton>{m.groups_new_submit()}</SubmitButton>
          </>
        }
      />
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublisherGroups)
  const currentUser = context.get(currentAccountContext)

  const submission = parseWithZod(await request.formData(), { schema: createGroupSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible: responsibleId, deputy: deputyId, addMember } = submission.value
  const { congregationId, id: actorId } = currentUser

  let group: { id: number; name: string }
  try {
    // One transaction: a publisher the save cannot move undoes the group's creation too.
    group = await withScopeFromContext(context, async db => {
      const created = await createPublisherGroup(db, {
        name,
        address,
        responsibleId,
        deputyId: deputyId ?? null,
        congregationId,
        actorId,
      })
      await changeGroupMembers(db, created.id, congregationId, { add: addMember, remove: [] }, actorId)
      return created
    })
  } catch (error) {
    const refusal = groupSaveRefusal(error)
    if (refusal == null) throw error
    return data(submission.reply(refusal), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.groups_new_success({ name: formatGroupName(group.name) }))
  return redirect(`/groups/${group.id}/view`, { headers: { 'Set-Cookie': await commitSession(session) } })
}
