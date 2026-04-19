import { Trash2 } from 'lucide-react'
import { Form, Link, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
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

export default function EditGroup({ loaderData }: Route.ComponentProps) {
  const { brothers, group } = loaderData

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
          <Form method="post" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">{m.groups_form_name()}</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder={m.groups_form_name_placeholder()}
                  defaultValue={group.name}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">{m.groups_form_address()}</Label>
                <Input
                  id="address"
                  name="address"
                  type="text"
                  placeholder={m.groups_form_address_placeholder()}
                  defaultValue={group.adress}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="responsible">{m.groups_form_responsible()}</Label>
                <select
                  id="responsible"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="responsible"
                  required
                  defaultValue={group.responsibleId}
                >
                  <option disabled>{m.groups_form_responsible_placeholder()}</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deputy">{m.groups_form_deputy()}</Label>
                <select
                  id="deputy"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  name="deputy"
                  defaultValue={group.deputyId ?? ''}
                >
                  <option value="">{m.groups_form_no_deputy()}</option>
                  {brothers.map(brother => (
                    <option key={brother.id} value={brother.id}>
                      {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                    </option>
                  ))}
                </select>
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

  const form = await request.formData()
  const name = form.get('name')
  const address = form.get('address')
  const responsibleId = Number(form.get('responsible'))
  const deputyRaw = form.get('deputy')
  const deputyId = deputyRaw ? Number(deputyRaw) : null

  const session = await getSession(request.headers.get('Cookie'))
  if (name == null || address == null || Number.isNaN(responsibleId)) {
    session.flash('error', m.groups_form_error_incomplete())
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

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
        name: String(name),
        address: String(address),
        responsibleId,
        deputyId,
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
