import { Archive, IdCard } from 'lucide-react'
import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { updatePublisher } from '~/features/publishers/server/update-publisher.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import { getBoolSetting } from '~/features/settings/server/settings.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/edit-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_edit_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const result = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: Prisma compound unique key
        id_congregationId: { id: requireParamId(params.publisherId, '/congregation/publishers'), congregationId },
      },
    })

    if (result == null) throw redirect('/congregation/publishers')

    const showAuxiliaryPioneer = await getBoolSetting(
      db,
      CongregationSettingKey.AuxiliaryPioneerProfileActivated,
      congregationId,
    )
    const groups = await db.publisherGroup.findMany({ where: { congregationId } })
    const { email, password, ...user } = result
    return {
      user: {
        ...user,
        email: email.includes('@placeholder.unitae.app') ? undefined : email,
      },
      groups,
      hideAuxiliaryPioneer: !showAuxiliaryPioneer,
    }
  })
}

export default function EditPublisher({ loaderData }: Route.ComponentProps) {
  const { user, groups, hideAuxiliaryPioneer } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={m.publishers_edit_title()}
        subtitle={m.publishers_edit_subtitle()}
        actions={
          user.isPublisher ? (
            <Form method="post" action={`/settings/users/${user.id}/unmake-publisher`}>
              <Button type="submit" variant="secondary" size="icon" title={m.publishers_edit_deactivate_title()}>
                <Archive className="size-4" />
              </Button>
            </Form>
          ) : (
            <Form method="post" action={`/settings/users/${user.id}/make-publisher`}>
              <Button type="submit" size="icon" title={m.publishers_edit_activate_title()}>
                <IdCard className="size-4" />
              </Button>
            </Form>
          )
        }
      />

      <Form method="post" className="flex flex-col gap-6">
        <PublisherPersonalInformationForm user={user} />
        <PublisherNominationForm user={user} />
        <PublisherFieldServiceForm user={user} groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <Button type="submit" size="lg" className="self-start">
          {m.publishers_edit_submit()}
        </Button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { congregationId } = await authenticateAndAuthorize(request)
  const form = await request.formData()
  const firstname = form.get('firstname')
  const lastname = form.get('lastname')
  const email = form.get('email')
  const gender = form.get('gender')
  const birthDate = form.get('birthDate')
  const baptismDate = form.get('baptismDate')
  const isHelder = form.get('isHelder')
  const isServant = form.get('isServant')
  const isAnointed = form.get('isAnointed')
  const groupId = Number(form.get('group'))
  const type = form.get('type')
  const phone = form.get('phone')
  const address = form.get('address')

  const previousPage = request.headers.get('referer')
  if (!firstname || !lastname) {
    return redirect(previousPage ?? `/congregation/publishers/${params.publisherId}/view`)
  }

  return withScope(congregationId, async db => {
    const user = await updatePublisher(
      db,
      requireParamId(params.publisherId, '/congregation/publishers'),
      congregationId,
      {
        firstname: String(firstname),
        lastname: String(lastname),
        gender: String(gender),
        baptismDate: baptismDate ? baptismDate.toString() : null,
        birthDate: birthDate ? birthDate.toString() : null,
        isHelder: Boolean(isHelder),
        isServant: Boolean(isServant),
        isAnointed: Boolean(isAnointed),
        groupId,
        email: email ? String(email) : null,
        type: String(type),
        address: String(address),
        phone: String(phone),
      },
    )
    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_edit_success({ name: user.firstname ?? '' }))
    return redirect(previousPage ?? `/congregation/publishers/${user.id}/view`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
