import { parseWithZod } from '@conform-to/zod/v4'
import { data, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { createGroupSchema } from '~/features/publishers/schemas/group.schema'
import { findGroupLeaderCandidates } from '~/features/publishers/server/groups.server'
import { createPublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import { GroupForm } from '~/features/publishers/ui/GroupForm'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { ValidationError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { PageHeader } from '~/shared/ui/PageHeader'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { formatGroupName } from '~/shared/utils/format-group-name'

import type { Route } from './+types/new-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.groups_new_meta_title() }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async (db, congregationId) => ({
    brothers: await findGroupLeaderCandidates(db, congregationId),
  }))
}

export default function NewGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { brothers } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.groups_new_title()}
        subtitle={m.groups_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups(), to: '/groups' }, { label: m.groups_new_title() }]}
        backTo="/groups"
      />

      <GroupForm
        candidates={brothers}
        lastResult={actionData}
        submitLabel={m.groups_new_submit()}
        onChange={markDirty}
      />
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManagePublisher = permissions.has(Permission.CanManagePublisherGroups)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const submission = parseWithZod(await request.formData(), { schema: createGroupSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible: responsibleId, deputy: deputyId } = submission.value

  const session = await getSession(request.headers.get('Cookie'))

  return withScopeFromContext(context, async db => {
    try {
      const group = await createPublisherGroup(db, {
        name,
        address,
        responsibleId,
        deputyId: deputyId ?? null,
        congregationId: currentUser.congregationId,
        actorId: currentUser.id,
      })

      session.flash('success', m.groups_new_success({ name: formatGroupName(group.name) }))
      return redirect(`/groups/${group.id}/view`, {
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
