import { parseWithZod } from '@conform-to/zod/v4'
import { data, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/index.server'
import { publisherFormSchema } from '~/features/publishers/schemas/publisher.schema'
import { createMember } from '~/features/publishers/server/create-member.server'
import { PublisherForm } from '~/features/publishers/ui/PublisherForm'
import * as m from '~/i18n/paraglide/messages'
import {
  congregationContext,
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
import { formatDateForInput } from '~/shared/utils/event-time'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { handleAppError } from '~/shared/utils/handle-app-error.server'

import type { Route } from './+types/new-publisher'

export const meta: Route.MetaFunction = () => [{ title: `${m.publishers_new_title()} - Unitae` }]

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublishers)

  return withScopeFromContext(context, async (db, congregationId) => {
    const groups = await db.publisherGroup.findMany({
      where: { congregationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    // A new record is usually a new arrival: the date starts at today, on the congregation's calendar.
    return { groups, arrivalDefault: formatDateForInput(new Date(), context.get(congregationContext).timezone) }
  })
}

export default function NewPublisher({ loaderData, actionData }: Route.ComponentProps) {
  const { blocker, setDirty } = useUnsavedChanges()

  return (
    <div className="flex flex-col">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.publishers_new_title()}
        subtitle={m.publishers_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publishers(), to: '/publishers' }, { label: m.publishers_new_title() }]}
      />
      <PublisherForm
        groups={loaderData.groups}
        arrivalDefault={loaderData.arrivalDefault}
        actionData={actionData}
        onDirtyChange={setDirty}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link to="/publishers">{m.common_cancel()}</Link>
            </Button>
            <SubmitButton>{m.publishers_new_submit()}</SubmitButton>
          </>
        }
      />
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  requirePermission(permissions, Permission.CanManagePublishers)
  const congregation = context.get(congregationContext)
  const currentUser = context.get(currentAccountContext)
  const submission = parseWithZod(await request.formData(), { schema: publisherFormSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const {
    firstname,
    lastname,
    email,
    gender,
    birthDate,
    baptismDate,
    arrivedAt,
    isHelder,
    isServant,
    isAnointed,
    group,
    phone,
    address,
  } = submission.value

  return withScopeFromContext(context, async db => {
    const session = await getSession(request.headers.get('Cookie'))
    try {
      const user = await createMember(db, congregation, {
        firstname,
        lastname,
        email: email ?? '',
        gender,
        birthDate: birthDate || null,
        baptismDate: baptismDate || null,
        arrivedAt: arrivedAt || null,
        isHelder,
        isServant,
        isAnointed,
        groupId: group ?? null,
        congregationId: currentUser.congregationId,
        phone: phone ?? '',
        address: address ?? '',
        actorId: currentUser.id,
      })

      session.flash('success', m.publishers_new_success({ name: formatPersonName(user) }))
      return redirect(`/publishers/${user.id}/view`, {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      })
    } catch (error) {
      await handleAppError(error, session, '/publishers/new')
    }
  })
}
