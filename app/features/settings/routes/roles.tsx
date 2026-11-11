import { parseWithZod } from '@conform-to/zod/v4'
import { SidePanel } from '@unitae/ui'
import { useEffect } from 'react'
import { data, Link, redirect, useFetcher, useSearchParams } from 'react-router'
import { editPermissionsSchema } from '~/features/settings/schemas/permissions.schema'
import { listRolesForPermissions } from '~/features/settings/server/role-permissions.queries'
import { peopleLabel, RoleList } from '~/features/settings/ui/RoleList'
import {
  type PermissionCategoryGroup,
  ROLE_PERMISSIONS_FORM_ID,
  RolePermissionsEditor,
} from '~/features/settings/ui/RolePermissionsEditor'
import { SettingsHeader } from '~/features/settings/ui/SettingsHeader'
import * as m from '~/i18n/paraglide/messages'
import { findAccountsWithPermission, LastAdminError } from '~/shared/auth/permissions.server'
import { currentAccountContext, permissionsContext, withScopeFromContext } from '~/shared/auth/route-context.server'
import { updateRolePermissions } from '~/shared/domain/roles.server'
import { ForbiddenError } from '~/shared/errors/app-error.server'
import { unscopedDb } from '~/shared/infra/db.server'
import { Permission } from '~/shared/types/permission'
import { getPermissionCategory, PERMISSION_CATEGORIES } from '~/shared/types/permission-display'
import { getRoleDisplayName } from '~/shared/types/role'
import { Button } from '~/shared/ui/button'
import { useCloseOnSave } from '~/shared/ui/hooks/use-close-on-save'
import { useSideEditor } from '~/shared/ui/hooks/use-side-editor'
import { SubmitButton } from '~/shared/ui/SubmitButton'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '~/shared/ui/sheet'
import { DiscardChangesDialog } from '~/shared/ui/UnsavedChangesDialog'
import { okWithToast } from './_toast.server'
import type { Route } from './+types/roles'

export const meta: Route.MetaFunction = () => [{ title: m.settings_roles_meta_title() }]

/** Every right, under its category, in the categories' order. */
function permissionCatalogue(): PermissionCategoryGroup[] {
  const keys = Object.values(Permission).filter(key => key !== Permission.CanDoAnything)
  return PERMISSION_CATEGORIES.map(category => ({
    category,
    keys: keys.filter(key => getPermissionCategory(key) === category),
  })).filter(group => group.keys.length > 0)
}

export async function loader({ context }: Route.LoaderArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanConfigurePermissions)) throw redirect('/')

  const roles = await withScopeFromContext(context, (db, congregationId) => listRolesForPermissions(db, congregationId))
  const admins = await findAccountsWithPermission(unscopedDb, currentUser.congregationId, Permission.CanDoAnything)
  return {
    roles,
    catalogue: permissionCatalogue(),
    actorIsAdmin: permissions.has(Permission.CanDoAnything),
    heldKeys: [...permissions],
    adminCount: admins.length,
    canManageRoles: permissions.has(Permission.CanManageRoles) || permissions.has(Permission.CanViewRoles),
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const permissions = context.get(permissionsContext)
  const currentUser = context.get(currentAccountContext)
  if (!permissions.has(Permission.CanConfigurePermissions)) throw redirect('/')

  const submission = parseWithZod(await request.formData(), { schema: editPermissionsSchema })
  if (submission.status !== 'success') return data({ ok: false as const, error: m.error_forbidden() }, { status: 400 })

  try {
    await withScopeFromContext(context, (db, congregationId) =>
      updateRolePermissions(
        db,
        submission.value.roleId,
        congregationId,
        currentUser.id,
        submission.value.permissionKeys,
        permissions,
      ),
    )
  } catch (error) {
    if (error instanceof LastAdminError)
      return data({ ok: false as const, error: m.settings_user_last_admin() }, { status: 409 })
    if (error instanceof ForbiddenError)
      return data({ ok: false as const, error: m.error_forbidden() }, { status: 403 })
    throw error
  }
  return okWithToast(request, m.settings_roles_saved())
}

export default function RolesPage({ loaderData }: Route.ComponentProps) {
  const { roles, catalogue, actorIsAdmin, heldKeys, adminCount, canManageRoles } = loaderData
  const fetcher = useFetcher<typeof action>()
  const panel = useSideEditor<'role'>(target => roles.some(role => role.id === target.id))
  const role = panel.target ? roles.find(each => each.id === panel.target?.id) : undefined
  const [searchParams] = useSearchParams()
  const editable = role != null && role.group !== 'admin'
  const refusal = fetcher.state === 'idle' && fetcher.data && !fetcher.data.ok ? fetcher.data.error : null
  useCloseOnSave(fetcher, panel.close)

  // An old link to a role's permissions opens that role.
  const linked = Number(searchParams.get('role'))
  const open = panel.open
  useEffect(() => {
    if (linked > 0) open({ kind: 'role', id: linked, trigger: null })
  }, [linked, open])

  const editor = role && (
    <RolePermissionsEditor
      key={role.id}
      role={role}
      catalogue={catalogue}
      fetcher={fetcher}
      formRef={panel.formRef}
      actorIsAdmin={actorIsAdmin}
      heldKeys={heldKeys}
      adminCount={adminCount}
    />
  )
  const description = role && `${kindLabel(role.group)} · ${peopleLabel(role.people)}`
  const footer = editable && (
    <>
      <Button type="button" variant="ghost" onClick={panel.close}>
        {m.common_cancel()}
      </Button>
      <SubmitButton form={ROLE_PERMISSIONS_FORM_ID} disabled={fetcher.state !== 'idle'}>
        {m.common_save()}
      </SubmitButton>
    </>
  )

  return (
    <div className="flex flex-col">
      <SettingsHeader
        title={m.settings_entry_roles()}
        subtitle={m.settings_roles_subtitle()}
        actions={
          canManageRoles && (
            <Button asChild variant="outline" size="sm">
              <Link to="/congregation/roles">{m.settings_roles_manage()}</Link>
            </Button>
          )
        }
      />
      {refusal && (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3.5 py-2.5 text-destructive text-sm">
          {refusal}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[3_1_480px]">
          <RoleList
            roles={roles}
            selectedId={role?.id ?? null}
            onSelect={(next, trigger) => panel.request({ kind: 'role', id: next.id, trigger })}
          />
        </div>
        {panel.docked && role && (
          <SidePanel
            key={role.id}
            title={getRoleDisplayName(role)}
            description={description}
            closeLabel={m.common_close()}
            onClose={() => panel.request(null)}
            returnFocus={panel.target?.trigger}
            footer={footer}
          >
            {editor}
          </SidePanel>
        )}
      </div>

      {!panel.docked && (
        <Sheet open={role != null} onOpenChange={next => !next && panel.close()}>
          <SheetContent className="sm:max-w-md">
            {role && (
              <>
                <SheetHeader>
                  <SheetTitle>{getRoleDisplayName(role)}</SheetTitle>
                  <SheetDescription>{description}</SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-4 pb-4">{editor}</div>
                {footer && <SheetFooter className="flex-row justify-end border-border border-t">{footer}</SheetFooter>}
              </>
            )}
          </SheetContent>
        </Sheet>
      )}

      <DiscardChangesDialog
        {...panel.discard}
        description={m.common_discard_changes_description()}
        discardLabel={m.common_discard_changes_confirm()}
      />
    </div>
  )
}

function kindLabel(group: 'admin' | 'congregation' | 'record'): string {
  if (group === 'admin') return m.settings_roles_kind_system()
  return group === 'record' ? m.settings_roles_kind_record() : m.settings_roles_kind_congregation()
}

export { RouteErrorBoundary as ErrorBoundary } from '~/shared/ui/RouteErrorBoundary'
