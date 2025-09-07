import { ArchiveBoxIcon, IdentificationIcon } from '@heroicons/react/24/outline'
import { Form, redirect } from 'react-router'
import { getBoolSetting } from '~/features/settings/server/settings'
import { HeroHeader } from '~/shared/ui/HeroHeader'
import PublisherFieldServiceForm from '~/features/publishers/ui/PublisherFieldServiceForm'
import PublisherNominationForm from '~/features/publishers/ui/PublisherNominationForm'
import PublisherPersonalInformationForm from '~/features/publishers/ui/PublisherPersonalInformationForm'
import { commitSession, getSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { CongregationSettingKey } from '~/shared/types/congregation-setting-key'
import type { Route } from './+types/edit-publisher'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Fiche Proclamateur - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const result = await db.user.findUnique({
    where: {
      id: requireParamId(params.publisherId, '/congregation/publishers'),
    },
  })

  if (result == null) throw redirect('/congregation/publishers')

  const showAuxiliaryPioneer = await getBoolSetting(CongregationSettingKey.AuxiliaryPioneerProfileActivated)
  const groups = await db.publisherGroup.findMany()
  const { email, password, ...user } = result
  return {
    user: {
      ...user,
      email: email.includes('@placeholder.unitae.app') ? undefined : email,
    },
    groups,
    hideAuxiliaryPioneer: !showAuxiliaryPioneer,
  }
}

export default function EditPublisher({ loaderData }: Route.ComponentProps) {
  const { user, groups, hideAuxiliaryPioneer } = loaderData

  return (
    <div className="flex flex-col">
      <HeroHeader
        title="Modification d'un proclamateur"
        subtitle="Modifier la fiche d'un proclamateur"
        actions={
          user.isPublisher ? (
            <Form method="post" action={`/settings/users/${user.id}/unmake-publisher`}>
              <button
                type="submit"
                title="Désactiver la fiche proclamateur. L'utilisateur ne sera plus proclamateur dans cette assemblée."
                className={'rounded-lg bg-gray-500 p-3 font-semibold text-white hover:bg-gray-700 max-sm:p-2'}
              >
                <ArchiveBoxIcon className={'inline size-6 max-sm:size-5'} />
              </button>
            </Form>
          ) : (
            <Form method="post" action={`/settings/users/${user.id}/make-publisher`}>
              <button
                type="submit"
                title="Activer le batiment"
                className={'rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900 max-sm:p-2'}
              >
                <IdentificationIcon className={'inline size-6 max-sm:size-5'} />
              </button>
            </Form>
          )
        }
      />

      <Form method="post" className="my-5 flex flex-col gap-3">
        <PublisherPersonalInformationForm user={user} />
        <PublisherNominationForm user={user} />
        <PublisherFieldServiceForm user={user} groups={groups} hideAuxiliaryPioneer={hideAuxiliaryPioneer} />

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Modifier le proclamateur
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
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

  const user = await db.user.update({
    where: {
      id: requireParamId(params.publisherId, '/congregation/publishers'),
    },
    data: {
      firstname: String(firstname),
      lastname: String(lastname),
      isMale: String(gender) === 'male',
      baptismDate: baptismDate ? new Date(baptismDate.toString()) : null,
      birthDate: birthDate ? new Date(birthDate.toString()) : null,
      isHelder: Boolean(isHelder),
      isServant: Boolean(isServant),
      isAnointed: Boolean(isAnointed),
      publisherGroupId: Number.isNaN(groupId) ? null : groupId,
      ...(!email ? {} : { email: String(email) }),
      type: String(type),
      address: String(address),
      phone: String(phone),
    },
  })
  const session = await getSession(request.headers.get('Cookie'))
  session.flash('success', `La fiche de proclammateur pour ${user.firstname} à été modifiée avec succès`)
  return redirect(previousPage ?? `/congregation/publishers/${user.id}/view`, {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
