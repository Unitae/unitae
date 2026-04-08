import { IdentificationIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { congregationContext, db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { AlertMessages } from '~/shared/ui/AlertMessages'

import type { Route } from './+types/edit-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { session } = await verifySession(request)
  const canManageUser = await verifyRole(request, Role.SettingsUserManager)
  const isAdmin = await verifyRole(request, Role.Admin)

  if (!canManageUser) {
    throw redirect('/')
  }

  const user = await db.user.findUnique({
    where: {
      id: requireParamId(params.userId, '/settings/users'),
    },
    include: {
      congregationRoles: { include: { role: true } },
    },
  })

  if (user == null) throw redirect('/settings/users')

  const roleList = await db.userRole.findMany()
  const missEmail = user.email.includes('@placeholder.unitae.app')

  return data(
    {
      email: missEmail ? null : user.email,
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      roles: user.congregationRoles.map(cr => cr.role),
      messages: { success: session.get('success'), error: session.get('error') },
      roleList,
      isPublisher: user.isPublisher,
      isAdmin,
    },
    {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    },
  )
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const { messages, roleList, isAdmin, ...user } = loaderData

  const publisherNotUser = user.email == null

  return (
    <div className="flex flex-col">
      <AlertMessages messages={messages} />
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Modification d'utilisateur</h1>
          <p className="text-gray-500 max-sm:text-sm">Modifier un utilisateur</p>
        </div>
        <div className="flex gap-2">
          {user.isPublisher === true ? (
            <Link
              to={`/congregation/publishers/${user.id}/edit`}
              className="rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900"
              title="Voir la fiche proclamateur de cet utilisateur"
            >
              <IdentificationIcon className="inline size-6" />
            </Link>
          ) : (
            <Form method="POST" action={`/settings/users/${user.id}/make-publisher`}>
              <button
                type="submit"
                className="rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900"
                title="Créer automatiquement une fiche proclamateur pour cet utilisateur"
              >
                <UserPlusIcon className="inline-block size-6" />
              </button>
            </Form>
          )}
          <Form method="post" action={`/password/${user.id}/invalidate`}>
            <button
              type="submit"
              className={`rounded-lg bg-teal-600 p-3 font-semibold text-white ${user.email == null ? 'cursor-not-allowed' : 'hover:bg-teal-900'}`}
              disabled={user.email == null}
              title={
                user.email == null
                  ? `Ajoutez d'abord une adresse email pour créer le compte utilisateur`
                  : `Envoi un email à l'utilisateur pour lui demander modifier son mot de passe`
              }
            >
              Réinitialiser le mot de passe
            </button>
          </Form>
        </div>
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex-1">
            Prénom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="firstname"
              type="text"
              placeholder="Prénom"
              defaultValue={user.firstname ?? ''}
            />
          </label>
          <label className="flex-1">
            Nom
            <input
              className="w-full rounded-md border p-1 dark:border-gray-300"
              name="lastname"
              type="text"
              placeholder="Nom"
              defaultValue={user.lastname ?? ''}
            />
          </label>
        </div>
        <label>
          Email
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="email"
            type="email"
            placeholder="Email"
            defaultValue={user.email ?? ''}
            required
          />
        </label>
        <label>
          <input
            className="mr-2 rounded-md border p-1 dark:border-gray-300"
            name="active"
            type="checkbox"
            defaultChecked={publisherNotUser ? false : user.active}
            disabled={publisherNotUser}
          />
          L'utilisateur peut se connecter et utiliser l'application
        </label>
        <h2 className="mt-3 font-semibold text-xl max-sm:text-lg">Droits utilisateur</h2>
        <div className="flex flex-wrap gap-3 max-sm:flex-col">
          {publisherNotUser ? (
            <p className="text-center text-sm">
              Cette personne n'est pas utilisatrice de Unitae. Vous ne pouvez donner des droits qu'à des utilisateurs.
              <br />
              Pour transformer ce proclamateur en utilisateur, ajoutez lui une adresse email et réinitialisez son mot de
              passe.
            </p>
          ) : (
            roleList.map(role => (
              <label
                key={role.id}
                className={`flex-1 basis-5/12 ${role.key === 'admin' && !isAdmin ? 'pointer-events-none' : ''}`}
              >
                <input
                  className="mr-2 rounded-md border p-1 dark:border-gray-300"
                  type="checkbox"
                  name="roles"
                  value={role.key}
                  defaultChecked={user.roles.map(el => el.key).includes(role.key)}
                />{' '}
                {role.description}
              </label>
            ))
          )}
        </div>
        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Modifier l'utilisateur
        </button>
      </Form>
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const canManageUser = await verifyRole(request, Role.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  const form = await request.formData()
  const firstname = form.get('firstname')
  const lastname = form.get('lastname')
  const email = form.get('email')
  const active = form.get('active')
  const roles = form.getAll('roles')

  const userId = requireParamId(params.userId, '/settings/users')
  const ctx = congregationContext.getStore()
  if (!ctx) throw redirect('/')

  await db.user.update({
    where: { id: userId },
    data: {
      firstname: String(firstname),
      lastname: String(lastname),
      email: String(email).toLocaleLowerCase(),
      active: Boolean(active),
    },
  })

  // Update congregation-scoped roles: delete existing, create new
  await db.congregationUserRole.deleteMany({
    where: { userId, congregationId: ctx.congregationId },
  })

  const roleRecords = await db.userRole.findMany({
    where: { key: { in: roles.map(String) } },
  })

  if (roleRecords.length > 0) {
    await db.congregationUserRole.createMany({
      data: roleRecords.map(role => ({
        userId,
        roleId: role.id,
        congregationId: ctx.congregationId,
      })),
    })
  }

  return redirect('/settings/users')
}
