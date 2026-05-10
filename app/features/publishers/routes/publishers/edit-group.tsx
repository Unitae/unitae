import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { PersonDropdown } from '~/shared/ui/PersonDropdown'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-group'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Modifier un groupe — Unitae' }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScopeFromContext(context, async db => {
    const brothers = await db.member.findMany({
      where: {
        congregationId: currentUser.congregationId,
        leftAt: null,
        isMale: true,
        OR: [{ isHelder: true }, { isServant: true }],
      },
      include: {
        responsibleFor: { select: { id: true, name: true } },
        deputyFor: { select: { id: true, name: true } },
      },
    })

    const group = await db.publisherGroup.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.groupId, '/groups'),
          congregationId: currentUser.congregationId,
        },
      },
    })

    if (group == null) {
      throw redirect('/groups/')
    }

    return { brothers, group }
  })
}

export default function EditGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { brothers, group } = loaderData
  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    defaultValue: {
      name: group.name,
      address: group.adress,
      responsible: String(group.responsibleId),
      deputy: group.deputyId != null ? String(group.deputyId) : '',
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: updateGroupSchema })
    },
  })

  const disabledIds = brothers
    .filter(b => {
      const responsibleElsewhere = b.responsibleFor && b.responsibleFor.id !== group.id
      const deputyElsewhere = b.deputyFor && b.deputyFor.id !== group.id
      return responsibleElsewhere || deputyElsewhere
    })
    .map(b => b.id)
  const disabledReason = (id: number) => {
    const brother = brothers.find(b => b.id === id)
    if (brother?.responsibleFor && brother.responsibleFor.id !== group.id)
      return m.groups_form_already_responsible({ name: brother.responsibleFor.name })
    if (brother?.deputyFor && brother.deputyFor.id !== group.id)
      return m.groups_form_already_deputy({ name: brother.deputyFor.name })
    return undefined
  }

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.groups_edit_title()}
        subtitle={m.groups_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_publisher_groups(), to: '/groups' }, { label: m.groups_edit_title() }]}
        backTo="/groups"
        actions={
          <Button asChild variant="destructive" size="icon" title={m.groups_edit_delete_title()}>
            <Link to={`/groups/${group.id}/delete`}>
              <Trash2 className="size-4" />
            </Link>
          </Button>
        }
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
                  defaultValue={fields.responsible.initialValue as string}
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
                  defaultValue={fields.deputy.initialValue as string}
                  placeholder={m.groups_form_no_deputy()}
                  noneLabel={m.groups_form_no_deputy()}
                  disabledIds={disabledIds}
                  disabledReason={disabledReason}
                  aria-invalid={fields.deputy.errors !== undefined}
                />
                {fields.deputy.errors && <p className="text-destructive text-sm">{fields.deputy.errors}</p>}
              </div>
            </div>

            <SubmitButton className="self-start">{m.common_save()}</SubmitButton>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const previousPage = request.headers.get('referer')
  const canManagePublisher = permissions.has(Permission.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const submission = parseWithZod(await request.formData(), { schema: updateGroupSchema })

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
    const group = await updateGroup(db, requireParamId(params.groupId, '/groups'), currentUser.congregationId, {
      name,
      address,
      responsibleId,
      deputyId: deputyId ?? null,
    })

    session.flash('success', m.groups_edit_success({ name: group.name }))
    return redirect('/groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
