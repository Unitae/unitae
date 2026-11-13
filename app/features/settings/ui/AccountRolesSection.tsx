import { FormSection, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import type { AccountPageRole, UserAccountRole } from '~/features/settings/server/user-accounts.queries'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDescription, getRoleDisplayName } from '~/shared/types/role'
import { Checkbox } from '~/shared/ui/checkbox'
import { cn } from '~/shared/utils/utils'

interface AccountRolesSectionProps {
  roles: AccountPageRole[]
  recordRoles: UserAccountRole[]
  isSelf: boolean
  editable: boolean
  canManageRoles: boolean
}

const people = (count: number) => m.settings_account_role_people({ count: count })

/** Why a role cannot be ticked or unticked here, or null when it can. */
function lockReason(role: AccountPageRole, isSelf: boolean): string | null {
  if (role.fromOrganigram) {
    const names = role.holders.join(', ')
    if (role.single) return names ? m.settings_account_role_single_held({ names }) : m.settings_account_role_single()
    return names ? m.settings_account_role_organigram_held({ names }) : m.settings_account_role_organigram()
  }
  if (!role.grantable)
    return role.key === 'admin' ? m.settings_account_role_admin_only() : m.settings_account_role_not_grantable()
  if (isSelf && role.assigned) return m.settings_account_role_own()
  return null
}

/**
 * The account's roles: those given to it, ticked here; the single-person roles, seated from the organigram; then the
 * roles its record gives it, which follow the record.
 */
export function AccountRolesSection({
  roles,
  recordRoles,
  isSelf,
  editable,
  canManageRoles,
}: AccountRolesSectionProps) {
  return (
    <FormSection title={m.settings_account_section_roles()} description={m.settings_account_section_roles_hint()}>
      <div className="col-span-full flex flex-col gap-3">
        {roles.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-3 text-muted-foreground text-sm">
            {m.settings_account_no_roles()}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {roles.map(role => {
              const reason = editable ? lockReason(role, isSelf) : null
              const locked = !editable || reason != null
              const id = `role-${role.id}`
              const description = [getRoleDescription(role), role.fromOrganigram ? null : people(role.holderCount)]
                .filter(Boolean)
                .join(' · ')
              return (
                <label
                  key={role.id}
                  htmlFor={id}
                  className={cn(
                    'flex gap-3 border-t px-4 py-3 first:border-t-0',
                    locked ? 'cursor-default' : 'cursor-pointer hover:bg-hover',
                  )}
                >
                  {/* A held role the viewer cannot untick still counts in the save, so it is not taken away. */}
                  {locked && role.assigned && !role.fromOrganigram && (
                    <input type="hidden" name="customRoleIds" value={role.id} />
                  )}
                  <Checkbox
                    id={id}
                    name={locked ? undefined : 'customRoleIds'}
                    value={String(role.id)}
                    defaultChecked={role.assigned}
                    disabled={locked}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn('font-medium text-sm', role.fromOrganigram && 'text-muted-foreground')}>
                      {getRoleDisplayName(role)}
                    </span>
                    {reason ? (
                      <span className="text-faint text-sm">{reason}</span>
                    ) : (
                      description && <span className="text-faint text-sm">{description}</span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        )}
        {recordRoles.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-faint text-sm">
            <span className="mr-0.5">{m.settings_account_record_roles()}</span>
            {recordRoles.map(role => (
              <Tag key={role.id}>{getRoleDisplayName(role)}</Tag>
            ))}
          </p>
        )}
        {canManageRoles && (
          <Link
            to="/congregation/roles"
            className="self-start font-medium text-brand-text text-sm underline-offset-4 hover:underline"
          >
            {m.settings_account_manage_roles()}
          </Link>
        )}
      </div>
    </FormSection>
  )
}
