import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Download, IdCard, ShieldAlert, UserPlus } from 'lucide-react'
import { data, Form, Link, redirect, useSubmit } from 'react-router'
import { editUserSchema } from '~/features/settings/schemas/user.schema'
import { updateAccount } from '~/features/settings/server/update-account.server'
import * as m from '~/i18n/paraglide/messages'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { isIdentityRoleKey } from '~/shared/domain/built-in-roles.server'
import { setUserCustomRoleAssignments } from '~/shared/domain/roles.server'
import { ConflictError } from '~/shared/errors/app-error.server'
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
import { Card, CardContent, CardHeader, CardTitle } from '~/shared/ui/card'
import { Checkbox } from '~/shared/ui/checkbox'
import { FormActions } from '~/shared/ui/FormActions'
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
  const currentUser = context.get(currentAccountContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)
  const isAdmin = permissions.has(Permission.Admin)

  if (!canManageUser) {
    throw redirect('/')
  }

  const canManageRoles = permissions.has(Permission.RolesManager)

  return withScopeFromContext(context, async db => {
    const user = await db.userAccount.findUnique({
      where: {
        id_congregationId: {
          id: requireParamId(params.accountId, '/settings/users'),
          congregationId: currentUser.congregationId,
        },
      },
      include: {
        member: { select: { id: true, firstname: true, lastname: true, isPublisher: true, anonymizedAt: true } },
        // Identity-role assignments for the matrix come from the linked Member
      },
    })

    if (user == null) throw redirect('/settings/users')

    const memberRoleAssignments = user.member
      ? await db.memberRoleAssignment.findMany({
          where: { memberId: user.member.id },
          select: { roleId: true },
        })
      : []
    const userRoleAssignments = await db.userRoleAssignment.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    })

    const allRoles = await db.role.findMany({
      where: { congregationId: currentUser.congregationId },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }, { key: 'asc' }],
    })
    // Built-in identity roles attach to Member; management/custom roles attach to UserAccount
    const assignedBuiltInIds = new Set(memberRoleAssignments.map(a => a.roleId))
    const assignedCustomIds = new Set(userRoleAssignments.map(a => a.roleId))

    return {
      email: user.email,
      id: user.id,
      memberId: user.member?.id ?? null,
      active: user.active,
      firstname: user.member?.firstname ?? user.firstname,
      lastname: user.member?.lastname ?? user.lastname,
      // Split on identity, not on isBuiltIn. System roles such as `admin` are stored
      // with isBuiltIn too — they must not be renamed or deleted — but they attach to
      // the UserAccount like a custom role, not to the Member. Grouping them with the
      // identity roles would submit them down the member-side path, where
      // syncBuiltInRoleAssignments does not manage them and the account never gets them.
      builtInRoles: allRoles
        .filter(r => isIdentityRoleKey(r.key))
        .map(r => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isAssigned: assignedBuiltInIds.has(r.id),
        })),
      customRoles: allRoles
        .filter(r => !isIdentityRoleKey(r.key))
        .map(r => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isAssigned: assignedCustomIds.has(r.id),
        })),
      canManageRoles,
      isPublisher: user.member?.isPublisher ?? false,
      isAdmin,
      anonymizedAt: user.anonymizedAt ?? user.member?.anonymizedAt ?? null,
      canAnonymize: isAdmin && user.id !== currentUser.id && !user.anonymizedAt,
      twoFactorEnabled: user.twoFactorEnabledAt != null,
    }
  })
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: large edit page with multiple optional sections (custom roles, danger-zone, anonymized banner)
export default function SettingsLayout({ loaderData, actionData }: Route.ComponentProps) {
  const { builtInRoles, customRoles, canManageRoles, canAnonymize, anonymizedAt, ...user } = loaderData

  const { blocker, markDirty } = useUnsavedChanges()
  const submit = useSubmit()
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
      {anonymizedAt && (
        <Alert variant="destructive">
          <AlertDescription>
            {m.settings_user_edit_anonymized_at({ date: new Date(anonymizedAt).toLocaleDateString('fr-FR') })}
          </AlertDescription>
        </Alert>
      )}
      <PageHeader
        title={m.settings_user_edit_title()}
        subtitle={m.settings_user_edit_subtitle()}
        breadcrumbs={[{ label: m.sidebar_users(), to: '/settings/users' }, { label: m.settings_user_edit_title() }]}
        backTo="/settings/users"
        actions={
          <>
            {user.isPublisher === true && user.memberId != null ? (
              <Button asChild variant="outline" size="icon" title={m.settings_user_edit_view_publisher_title()}>
                <Link to={`/publishers/${user.memberId}/edit`}>
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
            {user.twoFactorEnabled && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">{m.settings_user_2fa_reset_button()}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.settings_user_2fa_reset_confirm_title()}</AlertDialogTitle>
                    <AlertDialogDescription>{m.settings_user_2fa_reset_confirm_description()}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => submit(null, { method: 'post', action: `/settings/users/${user.id}/reset-2fa` })}
                    >
                      {m.settings_user_2fa_reset_button()}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
                <p className="font-medium text-muted-foreground text-sm">{m.settings_user_edit_roles_custom_label()}</p>
                {customRoles.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {m.settings_user_edit_roles_empty()}
                    {canManageRoles && (
                      <>
                        {' '}
                        <Link to="/congregation/roles/new" className="text-primary underline">
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

        {publisherNotUser && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground text-sm">
                {m.settings_user_edit_publisher_only_notice()}
                <br />
                {m.settings_user_edit_publisher_only_hint()}
              </p>
            </CardContent>
          </Card>
        )}

        <FormActions>
          <SubmitButton>{m.settings_user_edit_submit()}</SubmitButton>
        </FormActions>
      </Form>

      {canAnonymize && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive text-lg">
              <ShieldAlert className="size-5" />
              {m.settings_user_edit_danger_zone()}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">{m.settings_user_edit_delete_account_description()}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="shrink-0">
                    {m.settings_user_edit_delete_account_button()}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{m.settings_user_edit_delete_account_dialog_title()}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {m.settings_user_edit_delete_account_dialog_description()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        submit(null, { method: 'post', action: `/settings/users/${user.id}/delete-account` })
                      }
                    >
                      {m.settings_user_edit_delete_account_confirm()}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <div className="flex items-center justify-between gap-4">
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
                    <AlertDialogDescription>
                      {m.settings_user_edit_anonymize_dialog_description()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => submit(null, { method: 'post', action: `/settings/users/${user.id}/anonymize` })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {m.settings_user_edit_anonymize_confirm()}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const canManageUser = permissions.has(Permission.SettingsUserManager)

  if (!canManageUser) {
    throw redirect('/')
  }

  const accountId = requireParamId(params.accountId, '/settings/users')
  const submission = parseWithZod(await request.formData(), { schema: editUserSchema })

  if (submission.status !== 'success') {
    return data(submission.reply(), { status: 400 })
  }

  const { firstname, lastname, email, active, customRoleIds } = submission.value

  return withScopeFromContext(context, async db => {
    try {
      await updateAccount(db, accountId, currentUser.congregationId, currentUser.id, {
        firstname,
        lastname,
        email,
        active,
      })

      await setUserCustomRoleAssignments(db, accountId, currentUser.congregationId, currentUser.id, customRoleIds)
    } catch (error) {
      if (error instanceof ConflictError) {
        return data(submission.reply({ formErrors: [error.message] }), { status: 409 })
      }
      throw error
    }

    return redirect('/settings/users')
  })
}
