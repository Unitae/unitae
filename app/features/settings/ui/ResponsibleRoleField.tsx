import { NO_RESPONSIBLE_VALUE } from '~/features/settings/schemas/template.schema'
import * as m from '~/i18n/paraglide/messages'
import { Label } from '~/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export type ResponsibleRoleOption = { id: number; label: string }

type ResponsibleRoleFieldProps = {
  name: string
  label: string
  hint: string
  roles: ResponsibleRoleOption[]
  currentRoleId: number | null
  /** Members who hold `currentRoleId` today. Empty while a role is picked means nobody can act. */
  holders: { id: number; name: string }[]
}

/**
 * One responsible picker plus the answer to "and who is that, today?".
 *
 * The holder line is the point of the component. A role with nobody in it reads
 * exactly like a filled-in delegation on the form while granting no one
 * anything, so the empty case is called out in destructive text rather than
 * left to be discovered when an assignment never gets made.
 */
export function ResponsibleRoleField({ name, label, hint, roles, currentRoleId, holders }: ResponsibleRoleFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={currentRoleId?.toString() ?? NO_RESPONSIBLE_VALUE}>
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_RESPONSIBLE_VALUE}>{m.settings_template_responsible_none()}</SelectItem>
          {roles.map(role => (
            <SelectItem key={role.id} value={role.id.toString()}>
              {role.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-muted-foreground text-sm">{hint}</p>

      {currentRoleId != null && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{m.settings_template_responsible_holders()}</span>
          {holders.length > 0 ? (
            <span>{holders.map(holder => holder.name).join(', ')}</span>
          ) : (
            <span className="text-destructive">{m.settings_template_responsible_holders_none()}</span>
          )}
        </div>
      )}
    </div>
  )
}
