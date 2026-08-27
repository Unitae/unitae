import * as m from '~/i18n/paraglide/messages'
import {
  getPermissionCategory,
  getPermissionCategoryLabel,
  getPermissionDescription,
  getPermissionRequirements,
  PERMISSION_CATEGORIES,
  type PermissionCategory,
} from '~/shared/types/permission-display'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'

interface RolePermissionPickerProps {
  permissions: Array<{ id: number; key: string }>
  selectedKeys: string[]
  name?: string
  showHeader?: boolean
  disabledKeys?: string[]
  idPrefix?: string
}

export function RolePermissionPicker({
  permissions,
  selectedKeys,
  name = 'permissionKeys',
  showHeader = true,
  disabledKeys,
  idPrefix = 'permission',
}: RolePermissionPickerProps) {
  const selected = new Set(selectedKeys)
  const disabled = new Set(disabledKeys)
  const grouped = new Map<PermissionCategory, Array<{ id: number; key: string }>>()

  for (const permission of permissions) {
    const category = getPermissionCategory(permission.key)
    if (!category) continue
    const list = grouped.get(category) ?? []
    list.push(permission)
    grouped.set(category, list)
  }

  return (
    <div className="flex flex-col gap-6">
      {showHeader && (
        <div className="flex flex-col gap-1">
          <h3 className="font-medium text-base">{m.settings_role_edit_permissions_title()}</h3>
          <p className="text-muted-foreground text-sm">{m.settings_role_edit_permissions_subtitle()}</p>
        </div>
      )}
      {PERMISSION_CATEGORIES.map(category => {
        const items = grouped.get(category)
        if (!items || items.length === 0) return null
        return (
          <div key={category} className="flex flex-col gap-3">
            <h4 className="font-medium text-muted-foreground text-sm">{getPermissionCategoryLabel(category)}</h4>
            <div className="flex flex-wrap gap-3">
              {items.map(permission => {
                const isDisabled = disabled.has(permission.key)
                const requirements = getPermissionRequirements(permission.key)
                const unmet = requirements.some(requirement => !selected.has(requirement.key))
                return (
                  <div
                    key={permission.id}
                    className={`flex flex-1 basis-5/12 items-start gap-2 ${isDisabled ? 'opacity-50' : ''}`}
                  >
                    <Checkbox
                      id={`${idPrefix}-${permission.id}`}
                      name={name}
                      value={permission.key}
                      defaultChecked={selected.has(permission.key)}
                      disabled={isDisabled}
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`${idPrefix}-${permission.id}`} className="font-normal leading-tight">
                        {getPermissionDescription(permission.key)}
                      </Label>
                      {requirements.length > 0 && (
                        // Stated, never enforced: the admin decides. Highlighted only when a
                        // prerequisite is not currently granted, so the note is quiet when the
                        // combination already makes sense.
                        <p className={`text-xs leading-tight ${unmet ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {m.permission_requires_label()} {requirements.map(r => r.description).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
