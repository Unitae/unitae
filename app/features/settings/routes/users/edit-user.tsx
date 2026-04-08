import { IdCard, UserPlus } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession, verifySession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { verifyRole } from '~/features/authorization/server/verify-role.server'
import { congregationContext, db } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'

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
    <div className="flex flex-col gap-6">
      {messages.error && (
        <Alert variant="destructive">
          <AlertDescription>{messages.error}</AlertDescription>
        </Alert>
      )}
      {messages.success && (
        <Alert>
          <AlertDescription>{messages.success}</AlertDescription>
        </Alert>
      )}

      <PageHeader
        title="Modification d'utilisateur"
        subtitle="Modifier un utilisateur"
        actions={
          <>
            {user.isPublisher === true ? (
              <Button asChild variant="outline" size="icon" title="Voir la fiche proclamateur de cet utilisateur">
                <Link to={`/congregation/publishers/${user.id}/edit`}>
                  <IdCard className="size-4" />
                </Link>
              </Button>
            ) : (
              <Form method="POST" action={`/settings/users/${user.id}/make-publisher`}>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  title="Créer automatiquement une fiche proclamateur pour cet utilisateur"
                >
                  <UserPlus className="size-4" />
                </Button>
              </Form>
            )}
            <Form method="post" action={`/password/${user.id}/invalidate`}>
              <Button
                type="submit"
                variant="outline"
                disabled={user.email == null}
                title={
                  user.email == null
                    ? `Ajoutez d'abord une adresse email pour créer le compte utilisateur`
                    : `Envoi un email à l'utilisateur pour lui demander modifier son mot de passe`
                }
              >
                Réinitialiser le mot de passe
              </Button>
            </Form>
          </>
        }
      />

      <Card>
        <CardContent>
          <Form method="post" className="flex flex-col gap-4">
            <div className="flex gap-4 max-sm:flex-col">
              <div className="flex-1 space-y-2">
                <Label htmlFor="firstname">Prénom</Label>
                <Input
                  id="firstname"
                  name="firstname"
                  type="text"
                  placeholder="Prénom"
                  defaultValue={user.firstname ?? ''}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="lastname">Nom</Label>
                <Input id="lastname" name="lastname" type="text" placeholder="Nom" defaultValue={user.lastname ?? ''} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email"
                defaultValue={user.email ?? ''}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                name="active"
                value="on"
                defaultChecked={publisherNotUser ? false : user.active}
                disabled={publisherNotUser}
              />
              <Label htmlFor="active" className="font-normal">
                L'utilisateur peut se connecter et utiliser l'application
              </Label>
            </div>

            <Separator />

            <CardHeader className="p-0">
              <CardTitle className="text-lg">Droits utilisateur</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-4 max-sm:flex-col">
              {publisherNotUser ? (
                <p className="text-center text-muted-foreground text-sm">
                  Cette personne n'est pas utilisatrice de Unitae. Vous ne pouvez donner des droits qu'à des
                  utilisateurs.
                  <br />
                  Pour transformer ce proclamateur en utilisateur, ajoutez lui une adresse email et réinitialisez son
                  mot de passe.
                </p>
              ) : (
                roleList.map(role => (
                  <div
                    key={role.id}
                    className={`flex flex-1 basis-5/12 items-center gap-2 ${role.key === 'admin' && !isAdmin ? 'pointer-events-none opacity-50' : ''}`}
                  >
                    <Checkbox
                      id={`role-${role.id}`}
                      name="roles"
                      value={role.key}
                      defaultChecked={user.roles.map(el => el.key).includes(role.key)}
                    />
                    <Label htmlFor={`role-${role.id}`} className="font-normal">
                      {role.description}
                    </Label>
                  </div>
                ))
              )}
            </div>
            <Button type="submit" className="mt-2">
              Modifier l'utilisateur
            </Button>
          </Form>
        </CardContent>
      </Card>
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
