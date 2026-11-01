import { parseWithZod } from '@conform-to/zod/v4'
import { Trash2 } from 'lucide-react'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import {
  findGroupById,
  findGroupLeaderCandidates,
  findGroupMemberCandidates,
  listGroupMembers,
} from '~/features/publishers/server/groups.server'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import { GroupForm } from '~/features/publishers/ui/GroupForm'
import { GroupMembersCard } from '~/features/publishers/ui/GroupMembersCard'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_edit_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => {
    const group = await findGroupById(db, requireParamId(params.groupId, '/groups'), congregationId)
    if (group == null) {
      throw redirect('/groups/')
    }

    const [brothers, members, memberCandidates] = await Promise.all([
      findGroupLeaderCandidates(db, congregationId),
      listGroupMembers(db, group.id, congregationId),
      findGroupMemberCandidates(db, congregationId, group.id),
    ])
    return { brothers, group, members, memberCandidates }
  })
}

export default function EditGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { brothers, group, members, memberCandidates } = loaderData
  const viewPage = `/groups/${group.id}/view`
  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.groups_edit_title()}
        subtitle={m.groups_edit_subtitle()}
        breadcrumbs={[
          { label: m.sidebar_publisher_groups(), to: '/groups' },
          { label: formatGroupName(group.name), to: viewPage },
          { label: m.groups_edit_title() },
        ]}
        backTo={viewPage}
        actions={
          <Button
            asChild
            variant="destructive"
            size="icon"
            title={m.groups_edit_delete_title()}
            aria-label={m.groups_edit_delete_title()}
          >
            <Link to={`/groups/${group.id}/delete`}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
      />

      <GroupForm
        candidates={brothers}
        group={group}
        lastResult={actionData}
        submitLabel={m.common_save()}
        onChange={markDirty}
      />

      <GroupMembersCard
        groupId={group.id}
        responsibleId={group.responsibleId}
        deputyId={group.deputyId}
        members={members}
        candidates={memberCandidates}
      />
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateGroupSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible: responsibleId, deputy: deputyId } = submission.value

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async (db, congregationId) => {
    try {
      const groupId = requireParamId(params.groupId, '/groups')
      const group = await updateGroup(db, groupId, congregationId, currentUser.id, {
        name,
        address,
        responsibleId,
        deputyId: deputyId ?? null,
      })

      session.flash('success', m.groups_edit_success({ name: formatGroupName(group.name) }))
      return redirect(`/groups/${groupId}/view`, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    } catch (error) {
      // A leader the form no longer offers (a stale page) or never did: an error on the field.
      if (error instanceof ValidationError) {
        return data(submission.reply({ fieldErrors: { [error.field]: [error.message] } }), { status: 400 })
      }
      throw error
    }
  })
}
