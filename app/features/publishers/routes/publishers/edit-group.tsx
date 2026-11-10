import { parseWithZod } from '@conform-to/zod/v4'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import { changeGroupMembers } from '~/features/publishers/server/group-members.server'
import { groupSaveRefusal } from '~/features/publishers/server/group-save-refusal.server'
import {
  findGroupById,
  findGroupLeaderCandidates,
  findGroupMemberCandidates,
  listGroupMembers,
} from '~/features/publishers/server/groups.server'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import { DeleteGroupDialog } from '~/features/publishers/ui/DeleteGroupDialog'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  if (!context.get(permissionsContext).has(Permission.CanManagePublisherGroups)) throw redirect('/')

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await findGroupById(db, requireParamId(params.groupId, '/groups'), congregationId)
    if (group == null) throw redirect('/groups')

    const [leaders, members, candidates] = await Promise.all([
      findGroupLeaderCandidates(db, congregationId),
      listGroupMembers(db, group.id, congregationId),
      findGroupMemberCandidates(db, congregationId, group.id),
    ])
    return { group, leaders, members, candidates }
  })
}

export default function EditGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { group, leaders, members, candidates } = loaderData
  const name = formatGroupName(group.name)
  const viewPage = `/groups/${group.id}/view`
  const { blocker, setDirty } = useUnsavedChanges()
  // « Annuler » starts the form again from what is saved.
  const [version, setVersion] = useState(0)
  const [deleting, setDeleting] = useState(false)

  return (
    <div className="flex flex-col">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={name}
        subtitle={m.groups_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_publisher_groups(), to: '/groups' },
          { label: name, to: viewPage },
          { label: m.groups_view_edit_short() },
        ]}
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={m.common_more_actions()}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 />
                {m.groups_delete_menu()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <GroupForm
        key={version}
        group={group}
        leaders={leaders}
        members={members}
        candidates={candidates}
        lastResult={actionData}
        onDirtyChange={setDirty}
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => setVersion(value => value + 1)}>
              {m.common_cancel()}
            </Button>
            <SubmitButton>{m.common_save()}</SubmitButton>
          </>
        }
      />

      <DeleteGroupDialog group={deleting ? group : null} onClose={() => setDeleting(false)} />
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublisherGroups)
  const currentUser = context.get(currentAccountContext)
  const groupId = requireParamId(params.groupId, '/groups')

  const submission = parseWithZod(await request.formData(), { schema: updateGroupSchema })
  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible, deputy, addMember, removeMember } = submission.value
  const { congregationId, id: actorId } = currentUser

  let group: { name: string }
  try {
    // One transaction: a publisher the save cannot move undoes the rest of it.
    group = await withScopeFromContext(context, async db => {
      const updated = await updateGroup(db, groupId, congregationId, actorId, {
        name,
        address,
        responsibleId: responsible,
        deputyId: deputy ?? null,
      })
      await changeGroupMembers(db, groupId, congregationId, { add: addMember, remove: removeMember }, actorId)
      return updated
    })
  } catch (error) {
    const refusal = groupSaveRefusal(error)
    if (refusal == null) throw error
    return data(submission.reply(refusal), { status: 400 })
  }

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', m.groups_edit_success({ name: formatGroupName(group.name) }))
  return redirect(`/groups/${groupId}/view`, { headers: { 'Set-Cookie': await commitSession(session) } })
}
