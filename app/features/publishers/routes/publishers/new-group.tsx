import { Form, redirect } from 'react-router'

import { commitSession, getSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { db } from '~/shared/libs/db.server'

import type { Route } from './+types/new-group'

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManagePublisher = await verifyRole(request, Role.PublisherManager)

  if (!canManagePublisher) {
    throw redirect('/')
  }

  const brothers = await db.user.findMany({
    where: {
      // biome-ignore lint/style/useNamingConvention: Prisma OR operator
      OR: [{ isHelder: true }, { isServant: true }],
      responsibleFor: {
        is: null,
      },
      deputyFor: {
        is: null,
      },
    },
  })

  return { brothers }
}

export default function NewGroup({ loaderData }: Route.ComponentProps) {
  const { brothers } = loaderData

  return (
    <div className="flex flex-col">
      <h1 className="my-3 font-bold text-4xl">Nouveau groupe</h1>
      <p className="text-gray-500">Créer un nouveau groupe de predication</p>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1">
            Nom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="name"
              type="text"
              placeholder="Nom du groupe"
              required
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            Adresse
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="address"
              type="text"
              placeholder="Adresse du groupe de prédication"
              required
            />
          </label>
        </div>
        <div className="flex gap-3">
          <label className="flex-1">
            Responsable
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="responsible"
              required
            >
              <option>Choisir un frère responsable de groupe</option>
              {brothers.map(brother => (
                <option key={brother.id} value={brother.id}>
                  {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            Adjoint
            <select
              className="w-full appearance-none rounded-md border p-1 dark:border-gray-300"
              name="deputy"
              required
            >
              <option>Choisir un frère adjoint au responsable de groupe</option>
              {brothers.map(brother => (
                <option key={brother.id} value={brother.id}>
                  {brother.firstname} {brother.lastname?.toLocaleUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Créer le groupe
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
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

  const group = await db.publisherGroup.create({
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
      congregationId: 0 as number,
    },
  })

  session.flash('success', `Le groupe de prédication ${group.name} à été créé avec succès`)
  return redirect('/congregation/publisher-groups', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
