import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Trash2 } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/shared/types/role'
import { updateGroupSchema } from '~/features/publishers/schemas/group.schema'
import { updateGroup } from '~/features/publishers/server/update-group.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/edit-group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const brothers = await db.user.findMany({
      where: {
        congregationId,
        // biome-ignore lint/style/useNamingConvention: Prisma OR operator
        OR: [{ isHelder: true }, { isServant: true }],
      },
    })

    const group = await db.publisherGroup.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: requireParamId(params.groupId, '/congregation/publisher-groups'), congregationId },
      },
    })

    if (group == null) {
      throw redirect('/congregation/publisher-groups/')
    }

    return { brothers, group }
  })
}

export default function EditGroup({ loaderData, actionData }: Route.ComponentProps) {
  const { brothers, group } = loaderData
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.groups_edit_title()}
        subtitle={m.groups_edit_subtitle()}
        actions={
          <Button asChild variant="destructive" size="icon" title={m.groups_edit_delete_title()}>
            <Link to={`/congregation/publisher-groups/${group.id}/delete`}>
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
          <Form method="post" {...getFormProps(form)} className="flex flex-col gap-4">
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
                <select
                  id={fields.responsible.id}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name={fields.responsible.name}
                  required
                  defaultValue={fields.responsible.initialValue as string}
                >
                  <option disabled>{m.groups_form_responsible_placeholder()}</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
                {fields.responsible.errors && <p className="text-destructive text-sm">{fields.responsible.errors}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.deputy.id}>{m.groups_form_deputy()}</Label>
                <select
                  id={fields.deputy.id}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name={fields.deputy.name}
                  defaultValue={fields.deputy.initialValue as string}
                >
                  <option value="">{m.groups_form_no_deputy()}</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
                {fields.deputy.errors && <p className="text-destructive text-sm">{fields.deputy.errors}</p>}
              </div>
            </div>

            <Button type="submit" className="self-start">
              {m.common_save()}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const previousPage = request.headers.get('referer')
  const canManagePublisher = can(Role.PublisherManager)

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
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return withScope(congregationId, async db => {
    const group = await updateGroup(
      db,
      requireParamId(params.groupId, '/congregation/publisher-groups'),
      congregationId,
      {
        name,
        address,
        responsibleId,
        deputyId: deputyId ?? null,
      },
    )

    session.flash('success', m.groups_edit_success({ name: group.name }))
    return redirect('/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
