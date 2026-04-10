import { Form, redirect } from 'react-router'
import { changeUserPassword } from '~/features/authentication/server/change-user-password.server'
import { commitSession } from '~/features/authentication/server/session.server'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import logger from '~/shared/libs/logger.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import type { Route } from './+types/profile'

export const meta: Route.MetaFunction = () => {
  return [{ title: 'Mon profil - Unitae' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  const { currentUser, session, congregation } = await authenticateAndAuthorize(request)
  logger.info(`Loading profile data. User ID: ${currentUser.id}.`)

  return {
    user: {
      id: currentUser.id,
      email: currentUser.email,
      lastname: currentUser.lastname,
      firstname: currentUser.firstname,
      isPublisher: currentUser.isPublisher,
    },
    congregationName: congregation.displayName ?? congregation.name,
    error: session.get('error'),
  }
}

export default function ProfilePage({ loaderData }: Route.ComponentProps) {
  const { user, error, congregationName } = loaderData

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mon profil" subtitle="Informations de ton compte et paramètres de sécurité." />

      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">Nom</span>
            <span className="font-medium text-sm">{user.lastname?.toLocaleUpperCase() ?? '—'}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">Prénom</span>
            <span className="font-medium text-sm">{user.firstname ?? '—'}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground text-sm">Adresse email</span>
            <span className="font-medium text-sm">{user.email.toLocaleLowerCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground text-sm">Proclamateur à {congregationName}</span>
            <span className="font-medium text-sm">{user.isPublisher ? 'Oui' : 'Non'}</span>
          </div>
          <p className="mt-2 text-muted-foreground text-xs italic">
            Si certaines de ces informations ne sont pas bonnes, merci de contacter ton responsable de groupe de
            prédication.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Changer le mot de passe</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Mot de passe actuel</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new_password">Nouveau mot de passe</Label>
              <Input id="new_password" name="new_password" type="password" autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-fit">
              Changer mon mot de passe
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

export async function action({ request }: Route.ActionArgs) {
  const { session, currentUser } = await authenticateAndAuthorize(request)
  const formData = await request.formData()
  const password = formData.get('password')
  const newPassword = formData.get('new_password')

  const isSuccess = await changeUserPassword(currentUser.id, String(password), String(newPassword))

  if (!isSuccess) {
    session.flash('error', 'Impossible modifier le mot de passe.')
    return redirect('/me/profile', {
      headers: {
        'Set-Cookie': await commitSession(session),
      },
    })
  }

  return redirect('/profile', {
    headers: {
      'Set-Cookie': await commitSession(session),
    },
  })
}
