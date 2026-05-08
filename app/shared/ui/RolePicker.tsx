import { getRoleDisplayName } from '~/shared/types/role'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'

export interface RoleOption {
  id: number
  key: string
  name: string | null
  isBuiltIn: boolean
}

interface RolePickerProps {
  roles: RoleOption[]
  selectedIds: number[]
  name: string
  idPrefix: string
  helpText?: string
}

export function RolePicker({ roles, selectedIds, name, idPrefix, helpText }: RolePickerProps) {
  const selected = new Set(selectedIds)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {roles.map(role => (
          <div key={role.id} className="flex flex-1 basis-5/12 items-start gap-2">
            <Checkbox
              id={`${idPrefix}-${role.id}`}
              name={name}
              value={role.id.toString()}
              defaultChecked={selected.has(role.id)}
            />
            <Label htmlFor={`${idPrefix}-${role.id}`} className="font-normal leading-tight">
              {getRoleDisplayName(role)}
              {role.isBuiltIn ? <span className="ml-1 text-muted-foreground text-xs">(intégré)</span> : null}
            </Label>
          </div>
        ))}
      </div>
      {helpText ? <p className="text-muted-foreground text-xs">{helpText}</p> : null}
    </div>
  )
}
