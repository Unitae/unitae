import { Form, redirect } from 'react-router'
import { commitSession, getSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { createPublisher } from '~/features/publishers/server/create-publisher.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.publishers_new_meta_title() }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can, congregationId } = await authenticateAndAuthorize(request, [Role.PublisherManager])
  const canManagePublisher = can(Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const groups = await db.publisherGroup.findMany({ where: { congregationId } })

    return { groups, hideAuxiliaryPioneer: false }
  })
}

export default function NewPublisher({ loaderData }: Route.ComponentProps) {
  const { groups, hideAuxiliaryPioneer } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={m.publishers_new_title()} subtitle={m.publishers_new_subtitle()} />

      <Form method="post" className="flex flex-col gap-6">
        <PublisherPersonalInformationForm />
        <PublisherNominationForm />
        <PublisherFieldServiceForm groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <Button type="submit" size="lg" className="self-start">
          {m.publishers_new_submit()}
        </Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation, congregationId } = await authenticateAndAuthorize(request)
  const form = await request.formData()
  const firstname = String(form.get('firstname'))
  const lastname = String(form.get('lastname'))
  const email = String(form.get('email'))

  if (firstname.length < 1 || lastname.length < 1) {
    throw redirect('/congregation/publishers/new')
  }

  return withScope(congregationId, async db => {
    const user = await createPublisher(db, congregation, {
      firstname,
      lastname,
      email: form.has('email') && email.length > 0 ? email : null,
      gender: String(form.get('gender')),
      birthDate: form.get('birthDate')?.toString() ?? null,
      baptismDate: form.get('baptismDate')?.toString() ?? null,
      isHelder: Boolean(form.get('isHelder')),
      isServant: Boolean(form.get('isServant')),
      isAnointed: Boolean(form.get('isAnointed')),
      groupId: Number(form.get('group')),
      type: String(form.get('type')),
      congregationId,
    })

    const session = await getSession(request.headers.get('Cookie'))
    session.flash('success', m.publishers_new_success({ name: user.firstname ?? '' }))
    return redirect(`/congregation/publishers/${user.id}/edit`, {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  })
}
