import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Download, IdCard, ShieldAlert, UserPlus } from 'lucide-react'
import { data, Form, Link, redirect } from 'react-router'
import { editUserSchema } from '~/features/settings/schemas/user.schema'
import { setUserCustomRoleAssignments } from '~/features/settings/server/roles.server'
import { updateUser } from '~/features/settings/server/update-user.server'
import { RolePermissionPicker } from '~/features/settings/ui/RolePermissionPicker'
import * as m from '~/i18n/paraglide/messages'
import { permissionsContext, userContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { Permission } from '~/shared/types/permission'
import { getRoleDisplayName } from '~/shared/types/role'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { useFocusError } from '~/shared/ui/hooks/use-focus-error'
import { useUnsavedChanges } from '~/shared/ui/hooks/use-unsaved-changes'
import { Input } from '~/shared/ui/input'
import { Label } from '~/shared/ui/label'
import { PageHeader } from '~/shared/ui/PageHeader'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { UnsavedChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { requireParamId } from '~/shared/utils/params.server'

import type { Route } from './+types/edit-user'

export const meta: Route.MetaFunction = () => {
  return [{ title: m.settings_users_meta_title() }]
}

export function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)
  const isAdmin = permissions.has(Permission.Admin)

  if (!canManageUser) {
    throw redirect('/')
  }

  const canManageRoles = permissions.has(Permission.RolesManager)

  return withScopeFromContext(context, async db => {
    const user = await db.user.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.userId, '/settings/users'),
          congregationId: currentUser.congregationId,
        },
      },
      include: {
        congregationPermissions: { include: { permission: true } },
        roleAssignments: { include: { role: true } },
      },
    })

    if (user == null) throw redirect('/settings/users')

    const permissionList = await db.permission.findMany()
    const allRoles = await db.role.findMany({
      where: { congregationId: currentUser.congregationId },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }, { key: 'asc' }],
    })
    const assignedRoleIds = new Set(user.roleAssignments.map(a => a.roleId))
    const missEmail = user.email.includes('@placeholder.unitae.app')

    return {
      email: missEmail ? null : user.email,
      id: user.id,
      active: user.active,
      firstname: user.firstname,
      lastname: user.lastname,
      permissions: user.congregationPermissions.map(cp => cp.permission),
      permissionList,
      builtInRoles: allRoles
        .filter(r => r.isBuiltIn)
        .map(r => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isAssigned: assignedRoleIds.has(r.id),
        })),
      customRoles: allRoles
        .filter(r => !r.isBuiltIn)
        .map(r => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isAssigned: assignedRoleIds.has(r.id),
        })),
      canManageRoles,
      isPublisher: user.isPublisher,
      isAdmin,
      anonymizedAt: user.anonymizedAt,
      canAnonymize: isAdmin && user.id !== currentUser.id && !user.anonymizedAt,
    }
  })
}

export default function SettingsLayout({ loaderData, actionData }: Route.ComponentProps) {
  const { permissionList, builtInRoles, customRoles, canManageRoles, isAdmin, canAnonymize, anonymizedAt, ...user } =
    loaderData

  const { blocker, markDirty } = useUnsavedChanges()
  useFocusError(actionData)
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: editUserSchema })
    },
  })

  const publisherNotUser = user.email == null

  return (
    <div className="flex flex-col gap-6">
      <UnsavedChangesDialog blocker={blocker} />
      <PageHeader
        title={m.settings_user_edit_title()}
        subtitle={m.settings_user_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_users(), to: '/settings/users' }, { label: m.settings_user_edit_title() }]}
        backTo="/settings/users"
        actions={
          <>
            {user.isPublisher === true ? (
              <Button asChild variant="outline" size="icon" title={m.settings_user_edit_view_publisher_title()}>
                <Link to={`/publishers/${user.id}/edit`}>
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

      <Form method="post" {...getFormProps(form)} className="flex flex-col gap-6" onChange={markDirty}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{m.settings_user_edit_info_title()}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-4 max-sm:flex-col">
              <div className="flex-1 space-y-2">
                <Label htmlFor={fields.firstname.id}>{m.settings_user_edit_firstname_label()}</Label>
                <Input
                  {...getInputProps(fields.firstname, { type: 'text' })}
                  key={fields.firstname.id}
                  placeholder={m.settings_user_edit_firstname_label()}
                  defaultValue={user.firstname ?? ''}
                />
                {fields.firstname.errors && <p className="text-destructive text-sm">{fields.firstname.errors}</p>}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={fields.lastname.id}>{m.settings_user_edit_lastname_label()}</Label>
                <Input
                  {...getInputProps(fields.lastname, { type: 'text' })}
                  key={fields.lastname.id}
                  placeholder={m.settings_user_edit_lastname_label()}
                  defaultValue={user.lastname ?? ''}
                />
                {fields.lastname.errors && <p className="text-destructive text-sm">{fields.lastname.errors}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.email.id}>{m.settings_user_edit_email_label()}</Label>
              <Input
                {...getInputProps(fields.email, { type: 'email' })}
                key={fields.email.id}
                placeholder={m.settings_user_edit_email_label()}
                defaultValue={user.email ?? ''}
                required
              />
              {fields.email.errors && <p className="text-destructive text-sm">{fields.email.errors}</p>}
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
          </CardContent>
        </Card>

        {!publisherNotUser && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{m.settings_user_edit_roles_title()}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="font-medium text-muted-foreground text-sm">
                  {m.settings_user_edit_roles_built_in_label()}
                </p>
                <p className="text-muted-foreground text-xs">{m.settings_user_edit_roles_built_in_hint()}</p>
                <div className="flex flex-wrap gap-2">
                  {builtInRoles.map(role => (
                    <span
                      key={role.id}
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm ${
                        role.isAssigned
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      {getRoleDisplayName(role)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="font-medium text-muted-foreground text-sm">
                  {m.settings_user_edit_roles_custom_label()}
                </p>
                {customRoles.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {m.settings_user_edit_roles_empty()}
                    {canManageRoles && (
                      <>
                        {' '}
                        <Link to="/settings/congregation/roles/new" className="text-primary underline">
                          {m.settings_user_edit_roles_create_link()}
                        </Link>
                      </>
                    )}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-4 max-sm:flex-col">
                    {customRoles.map(role => (
                      <div key={role.id} className="flex flex-1 basis-5/12 items-center gap-2">
                        <Checkbox
                          id={`custom-role-${role.id}`}
                          name="customRoleIds"
                          value={String(role.id)}
                          defaultChecked={role.isAssigned}
                        />
                        <Label htmlFor={`custom-role-${role.id}`} className="font-normal">
                          {getRoleDisplayName(role)}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{m.settings_user_edit_rights_title()}</CardTitle>
            <CardDescription>{m.settings_user_edit_rights_subtitle()}</CardDescription>
          </CardHeader>
          <CardContent>
            {publisherNotUser ? (
              <p className="text-center text-muted-foreground text-sm">
                {m.settings_user_edit_publisher_only_notice()}
                <br />
                {m.settings_user_edit_publisher_only_hint()}
              </p>
            ) : (
              <RolePermissionPicker
                permissions={permissionList}
                selectedKeys={user.permissions.map(p => p.key)}
                name="permissions"
                showHeader={false}
                disabledKeys={isAdmin ? [] : [Permission.Admin]}
              />
            )}
          </CardContent>
        </Card>

        <SubmitButton className="self-start">{m.settings_user_edit_submit()}</SubmitButton>
      </Form>

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

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(userContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  const userId = requireParamId(params.userId, '/settings/users')
  const submission = parseWithZod(await request.formData(), { schema: editUserSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { firstname, lastname, email, active, permissions: selectedPermissions, customRoleIds } = submission.value

  return withScopeFromContext(context, async db => {
    await updateUser(db, userId, currentUser.congregationId, currentUser.id, {
      firstname,
      lastname,
      email,
      active,
      permissions: selectedPermissions,
    })

    await setUserCustomRoleAssignments(db, userId, currentUser.congregationId, currentUser.id, customRoleIds)

    return redirect('/settings/users')
  })
}
