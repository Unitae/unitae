import { ChartBarIcon, EnvelopeIcon, EyeIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Link, redirect } from 'react-router'

import { getGroup } from '~/features/publishers/server/groups'
import { commitSession, getSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'

import type { Route } from './+types/group'

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser } = await verifySession(request)
  const canViewPublishers = await verifyRole(request, Role.PublisherViewer)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)
  const canManageActivity = await verifyRole(request, Role.ActivityManager)

  if (!canViewPublishers) {
    throw redirect('/')
  }

  const group = await getGroup(requireParamId(params.groupId, '/congregation/publisher-groups'))
  if (group == null) {
    throw redirect('/congregation/publisher-groups/')
  }

  return {
    group,
    roles: {
      canManagePublisher,
      canViewPublishers,
      canManageActivity:
        canManageActivity || group.responsible.id === currentUser.id || group.deputy.id === currentUser.id,
    },
  }
}

export default function ViewGroup({ loaderData }: Route.ComponentProps) {
  const { group, roles } = loaderData

  const today = new Date()
  const lastMonth = new Date()
  lastMonth.setMonth(today.getMonth() - 1)

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl">{group.name.toLocaleUpperCase()}</h1>
          <p className="text-gray-500">
            Toutes les informations disponibles sur ce groupe de predication sont visualisables sur cette page
          </p>
        </div>
        <div className="flex gap-2">
          {roles.canManagePublisher && (
            <Link
              to={'../edit'}
              relative="path"
              className="rounded-lg bg-teal-500 p-3 font-semibold text-white hover:bg-teal-700 max-sm:p-2"
              title="Modifier le groupe de prédication"
            >
              <PencilIcon className="inline size-5" />
            </Link>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3 rounded-md bg-gray-900 p-5 text-white">
        <p>
          Responsable :{' '}
          <Link to={`../../../publishers/${group.responsible.id}/view`} relative="path" className="text-teal-600">
            {group.responsible.firstname} {group.responsible.lastname?.toLocaleUpperCase()}
          </Link>
        </p>
        <p>
          Adjoint au responsable :{' '}
          <Link to={`../../../publishers/${group.deputy.id}/view`} relative="path" className="text-teal-600">
            {group.deputy.firstname} {group.deputy.lastname?.toLocaleUpperCase()}
          </Link>
        </p>
        <p>
          Adresse : <span className="text-teal-600">{group.address}</span>
        </p>
        <p className="pt-5 text-sm italic">
          Si certaines de ces informations ne sont pas bonnes, merci de contacter le secrétaire.
        </p>
      </section>

      <section className="flex flex-col">
        <h2 className="my-3 font-bold text-2xl">Membres du groupe</h2>
        <p className="text-gray-500">Liste de tous les membres de ce groupe de prédication</p>
        <table className="mt-6 table grow border-collapse">
          <thead className="border-b border-b-slate-300 text-left font-bold max-sm:text-md dark:border-b-slate-500">
            <tr>
              <th className="w-[150px] py-4 text-center max-sm:w-14 max-sm:text-left">Prénom</th>
              <th className="w-[150px] py-4 text-center max-sm:w-14">Nom</th>
              <th className="w-[150px] py-4 text-center max-sm:hidden">Contact</th>
              {roles.canManageActivity === true && (
                <>
                  <th className="w-[150px] py-4 text-center max-sm:w-14">
                    Activité (
                    {lastMonth.toLocaleDateString('fr', {
                      month: 'short',
                      year: 'numeric',
                    })}
                    )
                  </th>
                  <th className="w-[150px] py-4 text-center max-sm:hidden">
                    Activité (
                    {today.toLocaleDateString('fr', {
                      month: 'short',
                      year: 'numeric',
                    })}
                    )
                  </th>
                </>
              )}
              {roles.canManagePublisher && <th className="w-[150px] py-4 text-center max-sm:w-14" />}
            </tr>
          </thead>
          <tbody className="text-left max-sm:text-sm">
            {group.members.map(member => (
              <tr key={member.email} className="border-b border-b-slate-200 dark:border-b-slate-800">
                <td className="py-3 text-center max-sm:text-left">
                  <Link className="hover:text-teal-600" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.firstname}
                  </Link>
                </td>
                <td className="py-3 text-center">
                  <Link className="hover:text-teal-600" to={`../../../publishers/${member.id}/view`} relative="path">
                    {member.lastname?.toLocaleUpperCase()}
                  </Link>
                </td>
                <td className="py-3 text-center max-sm:hidden">
                  {member.email.includes('@placeholder.unitae.app') === false && (
                    <Link to={`mailto:${member.email}`} className="hover:text-teal-600">
                      <EnvelopeIcon className="inline size-5" />
                    </Link>
                  )}
                </td>
                {roles.canManageActivity === true && (
                  <>
                    <td className="py-3 text-center">
                      <Link
                        to={
                          member.previousActivity != null
                            ? `/congregation/publishers/activity/${member.previousActivity?.id}/edit`
                            : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${lastMonth.getMonth()}&year=${lastMonth.getFullYear()}`
                        }
                        className="text-teal-600"
                        title="Modifier l'activité du proclamateur pour le mois courant"
                      >
                        {member.previousActivity ? (
                          <>
                            <ChartBarIcon className="inline size-5" /> Voir
                          </>
                        ) : (
                          <>
                            <PlusIcon className="inline size-5" /> Ajouter
                          </>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 text-center max-sm:hidden">
                      <Link
                        to={
                          member.currentActivity != null
                            ? `/congregation/publishers/activity/${member.currentActivity?.id}/edit`
                            : `/congregation/publishers/activity/new?publisherId=${member.id}&month=${today.getMonth()}&year=${today.getFullYear()}`
                        }
                        className="text-teal-600"
                        title="Modifier l'activité du proclamateur pour le mois courant"
                      >
                        {member.currentActivity ? (
                          <>
                            <ChartBarIcon className="inline size-5" /> Voir
                          </>
                        ) : (
                          <>
                            <PlusIcon className="inline size-5" /> Ajouter
                          </>
                        )}
                      </Link>
                    </td>
                  </>
                )}
                <td className="flex justify-end gap-3 py-3">
                  <Link to={`../../../publishers/${member.id}/view`} relative="path" className="hover:text-teal-600">
                    <EyeIcon className="inline size-5" />
                  </Link>
                  {roles.canManagePublisher && (
                    <Link to={`../../../publishers/${member.id}/edit`} relative="path" className="text-teal-600">
                      <PencilIcon className="inline size-5" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const previousPage = request.headers.get('referer')
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect(previousPage ?? '/')
  }

  const form = await request.formData()
  const name = form.get('name')
  const address = form.get('address')
  const responsibleId = Number(form.get('responsible'))
  const deputyId = Number(form.get('deputy'))

  const session = await getSession(request.headers.get('Cookie'))
  if (name == null || address == null || Number.isNaN(responsibleId) || Number.isNaN(deputyId)) {
    session.flash('error', 'Veuillez remplir entièrement le formulaire avant soumission')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  if (responsibleId === deputyId) {
    session.flash('error', 'Le responsable de groupe et son adjoint ne peuvent pas être la même personne')
    throw redirect(previousPage ?? '/congregation/publisher-groups', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  const group = await db.publisherGroup.update({
    where: {
      id: requireParamId(params.groupId, '/congregation/publisher-groups'),
    },
    data: {
      name: String(name),
      adress: String(address),
      deputyId,
      responsibleId,
      members: {
        connect: [
          {
            id: responsibleId,
          },
          { id: deputyId },
        ],
      },
    },
  })

  session.flash('success', `Le groupe de prédication ${group.name} à été modifié avec succès`)
  return redirect('/congregation/publisher-groups', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
