import { TerritoryKindKey } from '~/features/territories'
import * as m from '~/i18n/paraglide/messages'
import { Checkbox } from '~/shared/ui/checkbox'
import { Label } from '~/shared/ui/label'
import { type RoleOption, RolePicker } from '~/shared/ui/RolePicker'
import { Separator } from '~/shared/ui/separator'

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
  onChange: () => void
}

/**
 * Built-in kinds take their label from i18n; a custom kind (none yet) carries
 * its own name. Mirrors how built-in roles resolve their display name.
 */
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
 * One row per territory kind: which roles a publisher must hold to be
 * attributed a territory of that kind, and — for Phone, the only kind that has
 * one — its activation switch.
 */
export function TerritoryKindSettingsList({ kinds, roles, phoneTypeActivated, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{m.settings_territories_kinds_hint()}</p>
      {kinds.map((kind, index) => {
        const labelId = `kind-roles-label-${kind.key}`
        return (
          <div key={kind.id} className="flex flex-col gap-2">
            {index > 0 && <Separator className="mb-2" />}
            <p className="font-medium text-sm">{kindLabel(kind)}</p>
            {kind.key === TerritoryKindKey.Phone && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="phone-territory-active"
                  name="phone-territory-active"
                  value="on"
                  defaultChecked={phoneTypeActivated}
                  onCheckedChange={onChange}
                />
                <Label htmlFor="phone-territory-active" className="font-normal">
                  {m.settings_territories_phone_type_before()}{' '}
                  <span className="font-bold text-primary">{m.settings_territories_phone_type_highlight()}</span>
                  {m.settings_territories_phone_type_after()}
                </Label>
              </div>
            )}
            <Label id={labelId} className="font-normal text-muted-foreground text-xs">
              {m.settings_territories_kind_roles_label()}
            </Label>
            <RolePicker
              roles={roles}
              selectedIds={kind.allowedRoleIds}
              name={`kind-roles-${kind.key}`}
              idPrefix={`kind-roles-${kind.key}`}
              defaultLabel={m.settings_territories_kind_roles_default()}
              labelledBy={labelId}
            />
          </div>
        )
      })}
    </div>
  )
}
