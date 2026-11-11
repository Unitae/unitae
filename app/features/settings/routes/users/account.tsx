import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v4'
import { Status } from '@unitae/ui'
import { data, redirect } from 'react-router'
import { editUserSchema } from '~/features/settings/schemas/user.schema'
import { updateAccount } from '~/features/settings/server/update-account.server'
import { getAccountPage } from '~/features/settings/server/user-accounts.queries'
import { AccountActions } from '~/features/settings/ui/AccountActions'
import { AccountLoginSection } from '~/features/settings/ui/AccountLoginSection'
import { AccountRolesSection } from '~/features/settings/ui/AccountRolesSection'
import { AccountSecuritySection } from '~/features/settings/ui/AccountSecuritySection'
import { SettingsForm } from '~/features/settings/ui/SettingsForm'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import { accountState } from '~/features/settings/ui/UserAccountsTable'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { isAccountAdmin } from '~/shared/auth/permissions.server'
import {
  congregationContext,
  currentAccountContext,
  permissionsContext,
  withScopeFromContext,
} from '~/shared/auth/route-context.server'
import { setUserCustomRoleAssignments } from '~/shared/domain/roles.server'
import { ConflictError } from '~/shared/errors/app-error.server'
import { Permission } from '~/shared/types/permission'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { requireParamId } from '~/shared/utils/params.server'
import { accountRefusal } from '../_account-refusal.server'
import { redirectWithToast } from '../_toast.server'
import type { Route } from './+types/account'

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: loaderData ? m.settings_account_meta_title({ name: loaderData.name }) : m.settings_users_meta_title() },
]

export async function loader({ params, context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  const can = (permission: Permission) => permissions.has(permission)
  if (!can(Permission.CanViewUsers) && !can(Permission.CanManageUsers)) throw redirect('/')
  const accountId = requireParamId(params.accountId, '/settings/users')

  const page = await withScopeFromContext(context, (db, congregationId) =>
    getAccountPage(db, accountId, congregationId, permissions),
  )
  if (!page) throw redirect('/settings/users')

  const targetIsAdmin = await isAccountAdmin(accountId, currentUser.congregationId)
  const isSelf = accountId === currentUser.id
  const canManage = can(Permission.CanManageUsers)
  // An administrator's account is handled by administrators; an anonymised one is left as it is.
  const allowed = canManage && (!targetIsAdmin || can(Permission.CanDoAnything))
  const editable = allowed && page.anonymizedAt == null

  return {
    page,
    name: formatPersonName(page, page.email),
    isSelf,
    canManage,
    editable,
    allowed,
    adminNotice: canManage && !allowed,
    timeZone: context.get(congregationContext).timezone,
    canManageRoles: can(Permission.CanViewRoles) || can(Permission.CanManageRoles),
    recordEditHref:
      page.memberId != null && can(Permission.CanManagePublishers) ? `/publishers/${page.memberId}/edit` : null,
    rights: {
      viewRecord: can(Permission.CanViewPublishers),
      createRecord: allowed && can(Permission.CanManagePublishers) && page.anonymizedAt == null,
      makePublisher:
        can(Permission.CanManagePublishers) && page.memberId != null && !page.isPublisher && page.anonymizedAt == null,
      anonymise: allowed && can(Permission.CanAnonymisePeople) && page.anonymizedAt == null,
      delete: allowed && can(Permission.CanDeleteUserAccounts),
    },
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanManageUsers)) throw redirect('/')
  const accountId = requireParamId(params.accountId, '/settings/users')

  const submission = parseWithZod(await request.formData(), { schema: editUserSchema })
  if (submission.status !== 'success') return data(submission.reply(), { status: 400 })
  const { firstname, lastname, email, active, customRoleIds } = submission.value

  // Outside the transaction: a refused role change rolls the account edit back too.
  try {
    await withScopeFromContext(context, async (db, congregationId) => {
      await updateAccount(
        db,
        accountId,
        congregationId,
        currentUser.id,
        { firstname, lastname, email, active },
        permissions,
      )
      await setUserCustomRoleAssignments(db, accountId, congregationId, currentUser.id, customRoleIds, permissions)
    })
  } catch (error) {
    const reason = accountRefusal(error)
    if (reason) return data(submission.reply({ formErrors: [reason] }), { status: 403 })
    if (error instanceof ConflictError || (error as { code?: string } | null)?.code === 'P2002') {
      return data(submission.reply({ fieldErrors: { email: [m.settings_users_email_taken()] } }), { status: 409 })
    }
    throw error
  }

  return redirectWithToast(request, `/settings/users/${accountId}`, m.settings_account_saved())
}

export default function AccountPage({ loaderData, actionData }: Route.ComponentProps) {
  const { page, name, isSelf, canManage, editable, allowed, adminNotice, timeZone, rights } = loaderData
  const [form, fields] = useForm({
    lastResult: actionData,
    onValidate: ({ formData }) => parseWithZod(formData, { schema: editUserSchema }),
  })
  const state = accountState({ status: page.status, twoFactor: page.twoFactorEnabledAt != null })
  const anonymizedOn =
    page.anonymizedAt != null
      ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone }).format(new Date(page.anonymizedAt))
      : null

  return (
    <div className="flex max-w-4xl flex-col">
      <SettingsHeader
        title={name}
        subtitle={page.email}
        titleBadge={state && <Status tone={state.tone}>{state.label}</Status>}
        trail={[{ label: m.settings_entry_users(), to: '/settings/users' }]}
        actions={<AccountActions account={page} rights={rights} isSelf={isSelf} />}
      />

      {anonymizedOn && (
        <p className="mb-4 rounded-md bg-hover px-3.5 py-2.5 text-muted-foreground text-sm">
          {m.settings_user_edit_anonymized_at({ date: anonymizedOn })}
        </p>
      )}
      {adminNotice && (
        <p className="mb-4 rounded-md bg-hover px-3.5 py-2.5 text-muted-foreground text-sm">
          {m.settings_account_admin_notice()}
        </p>
      )}

      <SettingsForm {...getFormProps(form)} savedKey={JSON.stringify(page)} errors={form.errors}>
        <AccountLoginSection
          account={page}
          fields={fields}
          isSelf={isSelf}
          editable={editable}
          recordEditHref={loaderData.recordEditHref}
        />
        <AccountRolesSection
          roles={page.roles}
          recordRoles={page.recordRoles}
          isSelf={isSelf}
          editable={editable}
          canManageRoles={loaderData.canManageRoles}
        />
        {canManage && page.anonymizedAt == null && (
          <AccountSecuritySection
            account={{ ...page, invited: page.status === 'invited' }}
            allowed={allowed}
            timeZone={timeZone}
          />
        )}
      </SettingsForm>
    </div>
  )
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
