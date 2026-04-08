import { Form, redirect } from 'react-router'
import { commitSession, getSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import { db } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import { Button } from '~/shared/ui/button'
import { PageHeader } from '~/shared/ui/PageHeader'

import type { Route } from './+types/new-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Fiche Proclamateur - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const groups = await db.publisherGroup.findMany()

  return { groups, hideAuxiliaryPioneer: false }
}

export default function NewPublisher({ loaderData }: Route.ComponentProps) {
  const { groups, hideAuxiliaryPioneer } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouveau proclamateur" subtitle="Créer la fiche d'un nouveau proclamateur" />

      <Form method="post" className="flex flex-col gap-6">
        <PublisherPersonalInformationForm />
        <PublisherNominationForm />
        <PublisherFieldServiceForm groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <Button type="submit" size="lg" className="self-start">
          Créer le proclamateur
        </Button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { congregation } = await verifySession(request)
  const form = await request.formData()
  const firstname = String(form.get('firstname'))
  const lastname = String(form.get('lastname'))
  const email = String(form.get('email'))
  const gender = form.get('gender')
  const birthDate = form.get('birthDate')
  const baptismDate = form.get('baptismDate')
  const isHelder = form.get('isHelder')
  const isServant = form.get('isServant')
  const isAnointed = form.get('isAnointed')
  const groupId = Number(form.get('group'))
  const type = form.get('type')

  if (firstname.length < 1 || lastname.length < 1) {
    throw redirect('/congregation/publishers/new')
  }

  const limits = new LimitService(congregation)
  await limits.errorIfWouldGoOverLimit('publishers')

  const user = await db.user.create({
    data: {
      firstname: firstname,
      lastname: lastname,
      email:
        form.has('email') && email.length > 0 ? email : `${firstname}.${lastname}@placeholder.unitae.app`.toLowerCase(),
      active: true,
      password: 'password',
      isPublisher: true,
      isMale: String(gender) === 'male',
      baptismDate: baptismDate ? new Date(baptismDate.toString()) : null,
      birthDate: birthDate ? new Date(birthDate.toString()) : null,
      isHelder: Boolean(isHelder),
      isServant: Boolean(isServant),
      isAnointed: Boolean(isAnointed),
      publisherGroupId: Number.isNaN(groupId) ? null : groupId,
      type: String(type),
      congregationId: congregation.id,
    },
  })

  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', `La fiche de proclammateur pour ${user.firstname} à été créé avec succès`)
  return redirect(`/congregation/publishers/${user.id}/edit`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
