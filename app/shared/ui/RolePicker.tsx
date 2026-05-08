import { useState } from 'react'
import { getRoleDisplayName } from '~/shared/types/role'
import { cn } from '~/shared/utils/utils'

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
  defaultLabel: string
}

export function RolePicker({ roles, selectedIds, name, idPrefix, defaultLabel }: RolePickerProps) {
  const [selected, setSelected] = useState(() => new Set(selectedIds))

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.size === 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border border-dashed bg-background px-2.5 py-1 text-muted-foreground text-xs italic">
          {defaultLabel}
        </span>
      )}
      {roles.map(role => {
        const isSelected = selected.has(role.id)
        return (
          <label
            key={role.id}
            htmlFor={`${idPrefix}-${role.id}`}
            data-selected={isSelected}
            data-builtin={role.isBuiltIn}
            className={cn(
              'inline-flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
              role.isBuiltIn
                ? isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/70'
                : isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <input
              type="checkbox"
              id={`${idPrefix}-${role.id}`}
              name={name}
              value={role.id}
              checked={isSelected}
              onChange={() => toggle(role.id)}
              className="sr-only"
            />
            {getRoleDisplayName(role)}
          </label>
        )
      })}
    </div>
  )
}
