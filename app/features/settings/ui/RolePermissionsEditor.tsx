import { useState } from 'react'
import type { FetcherWithComponents } from 'react-router'
import type { RoleWithPermissions } from '~/features/settings/server/role-permissions.queries'
import * as m from '~/i18n/paraglide/messages'
import {
  getPermissionCategoryLabel,
  getPermissionDescription,
  getPermissionRequirements,
  type PermissionCategory,
} from '~/shared/types/permission-display'
import { Switch } from '~/shared/ui/switch'
import { cn } from '~/shared/utils/utils'

export const ROLE_PERMISSIONS_FORM_ID = 'role-permissions'

export interface PermissionCategoryGroup {
  category: PermissionCategory
  keys: string[]
}

interface RolePermissionsEditorProps {
  role: RoleWithPermissions
  catalogue: PermissionCategoryGroup[]
  fetcher: Pick<FetcherWithComponents<unknown>, 'Form'>
  formRef?: React.Ref<HTMLFormElement>
  /** The viewer holds every right: an administrator. */
  actorIsAdmin: boolean
  /** The rights the viewer holds, the only ones they may give or take away. */
  heldKeys: string[]
  adminCount: number
  className?: string
}

/**
 * What a role permits, one switch per right under its category. The administrator holds every right and is not
 * edited; a record's role is edited by administrators only; a right the viewer does not hold stays as it is.
 */
export function RolePermissionsEditor({
  role,
  catalogue,
  fetcher,
  formRef,
  actorIsAdmin,
  heldKeys,
  adminCount,
  className,
}: RolePermissionsEditorProps) {
  const [checked, setChecked] = useState(() => new Set(role.permissionKeys))
  const held = new Set(heldKeys)

  if (role.group === 'admin') {
    return (
      <div className={cn('flex flex-col gap-3 text-sm', className)}>
        <p className="font-medium">{m.settings_roles_all()}</p>
        <p className="text-muted-foreground">{m.settings_roles_admin_text()}</p>
        <p className="text-faint">{m.settings_roles_admin_count({ count: adminCount })}</p>
      </div>
    )
  }

  const recordLocked = role.isBuiltIn && !actorIsAdmin
  const toggle = (key: string, on: boolean) =>
    setChecked(previous => {
      const next = new Set(previous)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  return (
    <fetcher.Form
      method="post"
      id={ROLE_PERMISSIONS_FORM_ID}
      ref={formRef}
      className={cn('flex flex-col gap-5', className)}
    >
      <input type="hidden" name="roleId" value={role.id} />
      {[...checked].map(key => (
        <input key={key} type="hidden" name="permissionKeys" value={key} />
      ))}
      {recordLocked && (
        <p className="rounded-md bg-hover px-3 py-2 text-muted-foreground text-sm">
          {m.settings_roles_record_admin_only()}
        </p>
      )}
      {catalogue.map(({ category, keys }) => (
        <section key={category} className="flex flex-col gap-1">
          <h3 className="flex items-baseline justify-between gap-2 font-medium text-sm">
            {getPermissionCategoryLabel(category)}
            <span className="font-normal text-faint text-xs tabular-nums">
              {m.settings_roles_category_count({
                on: String(keys.filter(key => checked.has(key)).length),
                total: String(keys.length),
              })}
            </span>
          </h3>
          <div className="overflow-hidden rounded-lg border bg-card">
            {keys.map(key => {
              const locked = recordLocked || (!actorIsAdmin && !held.has(key))
              const on = checked.has(key)
              const missing = on
                ? getPermissionRequirements(key).filter(requirement => !checked.has(requirement.key))
                : []
              const id = `permission-${key}`
              return (
                <label
                  key={key}
                  htmlFor={id}
                  className={cn(
                    'flex items-start gap-3 border-t px-3.5 py-2.5 first:border-t-0',
                    !locked && 'cursor-pointer',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn('text-sm', locked && 'text-muted-foreground')}>
                      {getPermissionDescription(key)}
                    </span>
                    {missing.length > 0 && (
                      <span className="text-warning-text text-xs">
                        {m.settings_roles_requires({
                          names: missing.map(requirement => requirement.description).join(', '),
                        })}
                      </span>
                    )}
                    {locked && !recordLocked && (
                      <span className="text-faint text-xs">{m.settings_roles_not_held()}</span>
                    )}
                  </span>
                  <Switch id={id} checked={on} onCheckedChange={value => toggle(key, value)} disabled={locked} />
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </fetcher.Form>
  )
}
