import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { createGroupSchema } from '~/features/publishers/schemas/group.schema'
import { createPublisherGroup } from '~/features/publishers/server/publisher-group-mutations.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Role } from '~/shared/types/role'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'

import type { Route } from './+types/new-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Nouveau groupe — Unitae' }]
}

export function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const brothers = await db.user.findMany({
      where: {
        congregationId: currentUser.congregationId,
        isMale: true,
        OR: [{ isHelder: true }, { isServant: true }],
      },
      include: {
        responsibleFor: { select: { name: true } },
        deputyFor: { select: { name: true } },
      },
    })

    return { brothers }
  })
}

export default function NewGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { brothers } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createGroupSchema })
    },
  })

  const disabledIds = brothers.filter(b => b.responsibleFor || b.deputyFor).map(b => b.id)
  const disabledReason = (id: number) => {
    const brother = brothers.find(b => b.id === id)
    if (brother?.responsibleFor) return m.groups_form_already_responsible({ name: brother.responsibleFor.name })
    if (brother?.deputyFor) return m.groups_form_already_deputy({ name: brother.deputyFor.name })
    return undefined
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.groups_new_title()}
        subtitle={m.groups_new_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups(), to: '/groups' }, { label: m.groups_new_title() }]}
        backTo="/groups"
      />

      <Card>
        <CardHeader>
          <CardTitle>{m.groups_info_title()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4" onChange={markDirty}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={fields.name.id}>{m.groups_form_name()}</Label>
                <Input
                  {...getInputProps(fields.name, { type: 'text' })}
                  placeholder={m.groups_form_name_placeholder()}
                />
                {fields.name.errors && <p className="text-destructive text-sm">{fields.name.errors}</p>}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={fields.address.id}>{m.groups_form_address()}</Label>
                <Input
                  {...getInputProps(fields.address, { type: 'text' })}
                  placeholder={m.groups_form_address_placeholder()}
                />
                {fields.address.errors && <p className="text-destructive text-sm">{fields.address.errors}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.responsible.id}>{m.groups_form_responsible()}</Label>
                <PersonDropdown
                  id={fields.responsible.id}
                  name={fields.responsible.name}
                  people={brothers}
                  placeholder={m.groups_form_responsible_placeholder()}
                  allowNone={false}
                  disabledIds={disabledIds}
                  disabledReason={disabledReason}
                  aria-invalid={fields.responsible.errors !== undefined}
                />
                {fields.responsible.errors && <p className="text-destructive text-sm">{fields.responsible.errors}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.deputy.id}>{m.groups_form_deputy()}</Label>
                <PersonDropdown
                  id={fields.deputy.id}
                  name={fields.deputy.name}
                  people={brothers}
                  placeholder={m.groups_form_no_deputy()}
                  noneLabel={m.groups_form_no_deputy()}
                  disabledIds={disabledIds}
                  disabledReason={disabledReason}
                  aria-invalid={fields.deputy.errors !== undefined}
                />
                {fields.deputy.errors && <p className="text-destructive text-sm">{fields.deputy.errors}</p>}
              </div>
            </div>

            <SubmitButton className="self-start">{m.groups_new_submit()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const previousPage = request.headers.get('referer')
  const canManagePublisher = permissions.has(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const submission = parseWithZod(await request.formData(), { schema: createGroupSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { name, address, responsible: responsibleId, deputy: deputyId } = submission.value

  const session = await getSession(request.headers.get('Cookie'))

  if (deputyId != null && responsibleId === deputyId) {
    session.flash('error', m.groups_form_error_same_person())
    throw redirect(previousPage ?? '/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScopeFromContext(context, async db => {
    const group = await createPublisherGroup(db, {
      name,
      address,
      responsibleId,
      deputyId: deputyId ?? null,
      congregationId: currentUser.congregationId,
      actorId: currentUser.id,
    })

    session.flash('success', m.groups_new_success({ name: group.name }))
    return redirect('/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
