import { Panel } from '@unitae/ui'
import type { RoleGroup, RoleWithPermissions } from '~/features/settings/server/role-permissions.queries'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { cn } from '~/shared/utils/utils'

const GROUPS: { key: RoleGroup; title: () => string; hint: () => string }[] = [
  { key: 'admin', title: m.settings_roles_group_admin, hint: m.settings_roles_group_admin_hint },
  { key: 'congregation', title: m.settings_roles_group_congregation, hint: m.settings_roles_group_congregation_hint },
  { key: 'record', title: m.settings_roles_group_record, hint: m.settings_roles_group_record_hint },
]

export const peopleLabel = (count: number) =>
  count === 1 ? m.settings_account_role_people_one() : m.settings_account_role_people_many({ count: String(count) })

export function permissionsLabel(role: RoleWithPermissions): string {
  if (role.group === 'admin') return m.settings_roles_all()
  const count = role.permissionKeys.length
  if (count === 0) return m.settings_roles_permissions_none()
  return count === 1 ? m.settings_roles_permissions_one() : m.settings_roles_permissions_many({ count: String(count) })
}

interface RoleListProps {
  roles: RoleWithPermissions[]
  selectedId: number | null
  onSelect: (role: RoleWithPermissions, trigger: HTMLElement) => void
}

/** The roles in their three groups; a row opens what the role permits. */
export function RoleList({ roles, selectedId, onSelect }: RoleListProps) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(group => {
        const rows = roles.filter(role => role.group === group.key)
        if (rows.length === 0) return null
        return (
          <Panel
            key={group.key}
            title={
              <span className="flex flex-wrap items-baseline gap-x-2">
                {group.title()}
                <span className="font-normal text-faint text-sm">{group.hint()}</span>
              </span>
            }
          >
            {rows.map(role => {
              const selected = role.id === selectedId
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={event => onSelect(role, event.currentTarget)}
                  className={cn(
                    'flex w-full items-center gap-3 border-t px-4.5 py-2.5 text-left outline-none transition-colors duration-(--u-duration-fast) first:border-t-0 focus-visible:bg-hover',
                    selected ? 'bg-selected' : 'hover:bg-hover',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-sm">{getRoleDisplayName(role)}</span>
                  <span className="w-28 shrink-0 text-faint text-sm tabular-nums max-sm:hidden">
                    {peopleLabel(role.people)}
                  </span>
                  <span className="w-36 shrink-0 text-right text-muted-foreground text-sm tabular-nums">
                    {permissionsLabel(role)}
                  </span>
                </button>
              )
            })}
          </Panel>
        )
      })}
    </div>
  )
}
