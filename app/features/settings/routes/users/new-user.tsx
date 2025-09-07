import { Form, redirect } from 'react-router'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { requireCongregation, resolveCongregation } from '~/shared/libs/congregation.server'
import { db } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import type { Route } from './+types/new-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await verifySession(request)
  const canManageUser = await verifyRole(request, Role.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  return null
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const _users = loaderData

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
        <div>
          <h1 className="my-3 font-bold text-4xl max-sm:text-2xl">Nouvel utilisateur</h1>
          <p className="text-gray-500 max-sm:text-sm">Créer un nouvel utilisateur</p>
        </div>
        <div />
      </div>

      <Form method="post" className="my-5 flex flex-col gap-3">
        <label>
          Prénom
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="firstname"
            type="text"
            placeholder="Prénom"
          />
        </label>
        <label>
          Nom
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="lastname"
            type="text"
            placeholder="Nom"
          />
        </label>
        <label>
          Email
          <input
            className="w-full rounded-md border p-1 dark:border-gray-300"
            name="email"
            type="email"
            placeholder="Email"
          />
        </label>
        <button className="my-4 rounded-lg bg-teal-600 p-3 font-semibold text-white hover:bg-teal-900" type="submit">
          Créer l'utilisateur
        </button>
      </Form>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const firstname = String(form.get('firstname'))
  const lastname = String(form.get('lastname'))
  const email = String(form.get('email'))

  if (firstname.length < 1 || lastname.length < 1 || email.length < 1) {
    throw redirect('/settings/users/new')
  }

  const existingUser = await db.user.findUnique({
    where: {
      email: String(email),
    },
  })

  if (existingUser != null) {
    throw redirect('/settings/users/new')
  }

  const congregation = requireCongregation()
  const limits = new LimitService(congregation)
  await limits.errorIfWouldGoOverLimit('users')

  const user = await db.user.create({
    data: {
      firstname: String(firstname),
      lastname: String(lastname),
      email: String(email).toLocaleLowerCase(),
      active: true,
      password: 'password',
      congregationId: 0 as number,
    },
  })

  const token = await createPasswordResetToken(user.id)

  const ResetPasswordRequired = (await import('emails/reset-password-required')).default
  await sendResetUserPasswordEmail(
    user.id,
    <ResetPasswordRequired
      email={user.email}
      firstname={user.firstname || undefined}
      token={token}
      baseUrl={congregation.baseUrl}
      platformName={congregation.displayName}
    />,
  )

  return redirect('/settings/users')
}
