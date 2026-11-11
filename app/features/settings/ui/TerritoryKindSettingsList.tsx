import { useState } from 'react'
import { TerritoryKindKey } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import type { RoleOption } from '~/shared/types/role'
import { RoleChips } from '~/shared/ui/RoleChips'
import { Switch } from '~/shared/ui/switch'
import { cn } from '~/shared/utils/utils'

export interface TerritoryKindRow {
  id: number
  key: string
  name: string | null
  allowedRoleIds: number[]
}

interface Props {
  kinds: TerritoryKindRow[]
  roles: RoleOption[]
  phoneTypeActivated: boolean
}

/** Built-in kinds take their label from the catalogue; a custom kind (none yet) carries its own name. */
function kindLabel(kind: TerritoryKindRow): string {
  switch (kind.key) {
    case TerritoryKindKey.Classical:
      return m.territories_type_classical_capitalized()
    case TerritoryKindKey.Univ:
      return m.territories_type_university_singular()
    case TerritoryKindKey.Commerces:
      return m.territories_type_commerces()
    case TerritoryKindKey.Phone:
      return m.territories_type_phone_singular()
    case TerritoryKindKey.Hotel:
      return m.territories_type_hotel()
    default:
      return kind.name ?? kind.key
  }
}

/**
 * One row per territory kind: the roles a publisher must hold to receive it, and, for the telephone, the only kind
 * that can be switched off, its switch. A kind switched off keeps its roles for when it comes back.
 */
export function TerritoryKindSettingsList({ kinds, roles, phoneTypeActivated }: Props) {
  const [phoneOn, setPhoneOn] = useState(phoneTypeActivated)

  return (
    <div className="col-span-full overflow-hidden rounded-lg border bg-card">
      {kinds.map(kind => {
        const labelId = `kind-roles-label-${kind.key}`
        const isPhone = kind.key === TerritoryKindKey.Phone
        const off = isPhone && !phoneOn
        return (
          <div key={kind.id} className="flex flex-col gap-2.5 border-t px-4 py-3 first:border-t-0">
            <div className="flex items-center gap-3">
              <span id={labelId} className={cn('flex-1 font-medium text-sm', off && 'text-faint')}>
                {kindLabel(kind)}
              </span>
              {isPhone && (
                <Switch
                  name="phone-territory-active"
                  checked={phoneOn}
                  onCheckedChange={setPhoneOn}
                  aria-label={m.settings_territories_phone_active_label()}
                />
              )}
            </div>
            <div className={cn(off && 'opacity-60')}>
              <RoleChips
                roles={roles}
                selectedIds={kind.allowedRoleIds}
                name={`kind-roles-${kind.key}`}
                defaultLabel={m.settings_territories_kind_roles_default()}
                labelledBy={labelId}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
