import { Form, redirect } from 'react-router'
import { createPasswordResetToken } from '~/features/authentication/server/invalidate-user-password.server'
import { sendResetUserPasswordEmail } from '~/features/authentication/server/send-reset-user-password-email.server'
import { Role } from '~/features/authorization/model/roles.type'
import { audit, AuditAction } from '~/shared/libs/audit.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { LimitService } from '~/shared/libs/limits.server'
import { Button } from '~/shared/ui/button'
import { Card, CardContent } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/new-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Réglages - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { can } = await authenticateAndAuthorize(request, [Role.SettingsUserManager])
  const canManageUser = can(Role.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  return null
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const _users = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nouvel utilisateur" subtitle="Créer un nouvel utilisateur" />

      <Card>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstname">Prénom</Label>
              <Input id="firstname" name="firstname" type="text" placeholder="Prénom" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastname">Nom</Label>
              <Input id="lastname" name="lastname" type="text" placeholder="Nom" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="Email" />
            </div>
            <Button type="submit" className="mt-2">
              Créer l'utilisateur
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { currentUser, congregation, congregationId } = await authenticateAndAuthorize(request)
  const form = await request.formData()
  const firstname = String(form.get('firstname'))
  const lastname = String(form.get('lastname'))
  const email = String(form.get('email'))

  if (firstname.length < 1 || lastname.length < 1 || email.length < 1) {
    throw redirect('/settings/users/new')
  }

  return withScope(congregationId, async db => {
    const existingUser = await db.user.findUnique({
      where: {
        email: String(email),
      },
    })

    if (existingUser != null) {
      throw redirect('/settings/users/new')
    }

    const limits = new LimitService(db, congregation)
    await limits.errorIfWouldGoOverLimit('users')

    const user = await db.user.create({
      data: {
        firstname: String(firstname),
        lastname: String(lastname),
        email: String(email).toLocaleLowerCase(),
        active: true,
        password: 'password',
        congregationId,
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

    audit({
      action: AuditAction.UserCreated,
      congregationId,
      actorId: currentUser.id,
      entityType: 'User',
      entityId: user.id,
    })

    return redirect('/settings/users')
  })
}
