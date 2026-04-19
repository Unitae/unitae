import { parseWithZod } from '@conform-to/zod'
import { Download, IdCard, ShieldAlert, UserPlus } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { commitSession } from '~/features/authentication/server/session.server'
import { Role } from '~/features/authorization/model/roles.type'
import { editUserSchema } from '~/features/settings/schemas/user.schema'
import { updateUser } from '~/features/settings/server/update-user.server'
import * as m from '~/paraglide/messages'
import { authenticateAndAuthorize } from '~/shared/libs/auth.server'
import { withScope } from '~/shared/libs/db.server'
import { requireParamId } from '~/shared/libs/params.server'
import { Alert, AlertDescription } from '~/shared/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/shared/ui/alert-dialog'
import { Button } from '~/shared/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { Separator } from '~/shared/ui/separator'

import type { Route } from './+types/edit-user'

function getRoleDescription(key: string): string {
  const descriptions: Record<string, () => string> = {
    admin: () => m.role_desc_admin(),
    'board-uploader': () => m.role_desc_board_uploader(),
    'board-validator': () => m.role_desc_board_validator(),
    'territories-viewer': () => m.role_desc_territories_viewer(),
    'territories-manager': () => m.role_desc_territories_manager(),
    'settings-user-manager': () => m.role_desc_settings_user_manager(),
    'publisher-viewer': () => m.role_desc_publisher_viewer(),
    'publisher-manager': () => m.role_desc_publisher_manager(),
    'activity-manager': () => m.role_desc_activity_manager(),
    'activity-viewer': () => m.role_desc_activity_viewer(),
    'program-viewer': () => m.role_desc_program_viewer(),
    'program-manager': () => m.role_desc_program_manager(),
    'prospection-viewer': () => m.role_desc_prospection_viewer(),
    'prospection-manager': () => m.role_desc_prospection_manager(),
  }
  return descriptions[key]?.() ?? key
}

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_users_meta_title() }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { currentUser, session, can, congregationId } = await authenticateAndAuthorize(request, [
    Role.SettingsUserManager,
    Role.Admin,
  ])
  const canManageUser = can(Role.SettingsUserManager)
  const isAdmin = can(Role.Admin)

  if (!canManageUser) {
    throw redirect('/')
  }

  return withScope(congregationId, async db => {
    const user = await db.user.findUnique({
      where: {
        // biome-ignore lint/style/useNamingConvention: prisma compound key
        id_congregationId: { id: requireParamId(params.userId, '/settings/users'), congregationId },
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
        anonymizedAt: user.anonymizedAt,
        canAnonymize: isAdmin && user.id !== currentUser.id && !user.anonymizedAt,
      },
      {
        headers: {
          'Set-Cookie': await commitSession(session),
        },
      },
    )
  })
}

export default function SettingsLayout({ loaderData }: Route.ComponentProps) {
  const { messages, roleList, isAdmin, canAnonymize, anonymizedAt, ...user } = loaderData

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
        title={m.settings_user_edit_title()}
        subtitle={m.settings_user_edit_subtitle()}
        actions={
          <>
            {user.isPublisher === true ? (
              <Button asChild variant="outline" size="icon" title={m.settings_user_edit_view_publisher_title()}>
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
                  title={m.settings_user_edit_create_publisher_title()}
                >
                  <UserPlus className="size-4" />
                </Button>
              </Form>
            )}
            <Button asChild variant="outline" size="icon" title={m.settings_user_edit_export_data_title()}>
              <a href={`/settings/users/${user.id}/export-data`} download>
                <Download className="size-4" />
              </a>
            </Button>
            <Form method="post" action={`/password/${user.id}/invalidate`}>
              <Button
                type="submit"
                variant="outline"
                disabled={user.email == null}
                title={
                  user.email == null
                    ? m.settings_user_edit_reset_no_email_hint()
                    : m.settings_user_edit_reset_email_hint()
                }
              >
                {m.settings_user_edit_reset_password()}
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
                <Label htmlFor="firstname">{m.settings_user_edit_firstname_label()}</Label>
                <Input
                  id="firstname"
                  name="firstname"
                  type="text"
                  placeholder={m.settings_user_edit_firstname_label()}
                  defaultValue={user.firstname ?? ''}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="lastname">{m.settings_user_edit_lastname_label()}</Label>
                <Input
                  id="lastname"
                  name="lastname"
                  type="text"
                  placeholder={m.settings_user_edit_lastname_label()}
                  defaultValue={user.lastname ?? ''}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{m.settings_user_edit_email_label()}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={m.settings_user_edit_email_label()}
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
                {m.settings_user_edit_active_label()}
              </Label>
            </div>

            <Separator />

            <CardHeader className="p-0">
              <CardTitle className="text-lg">{m.settings_user_edit_rights_title()}</CardTitle>
            </CardHeader>
            <div className="flex flex-wrap gap-4 max-sm:flex-col">
              {publisherNotUser ? (
                <p className="text-center text-muted-foreground text-sm">
                  {m.settings_user_edit_publisher_only_notice()}
                  <br />
                  {m.settings_user_edit_publisher_only_hint()}
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
                      {getRoleDescription(role.key)}
                    </Label>
                  </div>
                ))
              )}
            </div>
            <Button type="submit" className="mt-2">
              {m.settings_user_edit_submit()}
            </Button>
          </Form>
        </CardContent>
      </Card>

      {canAnonymize && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-lg">
              <ShieldAlert className="size-5" />
              {m.settings_user_edit_danger_zone()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">{m.settings_user_edit_anonymize_description()}</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  {m.settings_user_edit_anonymize_button()}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{m.settings_user_edit_anonymize_dialog_title()}</AlertDialogTitle>
                  <AlertDialogDescription>{m.settings_user_edit_anonymize_dialog_description()}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                  <Form method="post" action={`/settings/users/${user.id}/anonymize`}>
                    <AlertDialogAction
                      type="submit"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {m.settings_user_edit_anonymize_confirm()}
                    </AlertDialogAction>
                  </Form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {anonymizedAt && (
        <Alert variant="destructive">
          <AlertDescription>
            {m.settings_user_edit_anonymized_at({ date: new Date(anonymizedAt).toLocaleDateString('fr-FR') })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export async function action({ request, params }: Route.ActionArgs) {
  const { currentUser, congregationId, can } = await authenticateAndAuthorize(request, [Role.SettingsUserManager])
  const canManageUser = can(Role.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  const userId = requireParamId(params.userId, '/settings/users')
  const submission = parseWithZod(await request.formData(), { schema: editUserSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { firstname, lastname, email, active, roles } = submission.value

  return withScope(congregationId, async db => {
    await updateUser(db, userId, congregationId, currentUser.id, {
      firstname,
      lastname,
      email,
      active,
      roles,
    })

    return redirect('/settings/users')
  })
}
