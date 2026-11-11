import { Avatar, Status, type StatusTone, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import type { UserAccountRow } from '~/features/settings/server/user-accounts.queries'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'

/** What the state column says, if anything: an ordinary active account says nothing. */
export function accountState(
  row: Pick<UserAccountRow, 'status' | 'twoFactor'>,
): { tone: StatusTone; label: string } | null {
  if (row.status === 'anonymized') return { tone: 'neutral', label: m.settings_users_state_anonymized() }
  if (row.status === 'deactivated') return { tone: 'neutral', label: m.settings_users_state_deactivated() }
  if (row.status === 'invited') return { tone: 'warning', label: m.settings_users_state_invited() }
  if (row.twoFactor) return { tone: 'success', label: m.settings_users_state_two_factor() }
  return null
}

/** Beside the account's own roles: how many its record gives, or that it has no record. */
function recordLine(row: UserAccountRow): string {
  if (row.memberId == null) return m.settings_users_no_record()
  const count = String(row.recordRoleCount)
  return row.roles.length > 0
    ? m.settings_users_record_roles_more({ count })
    : m.settings_users_record_roles_only({ count })
}

/**
 * The accounts as a table: the person, the account's own roles and those its record gives, its state. A row opens the
 * account (its name is the link, stretched over the row). On a phone, the name with its first role or its state.
 */
export function UserAccountsTable({ rows }: { rows: UserAccountRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.settings_users_col_person()}</th>
            <th className={headClass}>{m.settings_users_col_roles()}</th>
            <th className={headClass}>{m.settings_users_col_state()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const name = formatPersonName(row, row.email)
            const state = accountState(row)
            const muted = row.status === 'deactivated' || row.status === 'anonymized'
            return (
              <tr
                key={row.id}
                onClick={openRowOnClick}
                className="group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover"
              >
                <td className={cn(cellClass, 'py-2')}>
                  <Link
                    to={`/settings/users/${row.id}`}
                    data-row-primary
                    className="flex items-center gap-3 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar name={name} className={cn(muted && 'opacity-60')} />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn('truncate font-medium', muted && 'text-muted-foreground')}>{name}</span>
                      <span className="truncate text-faint text-xs">{row.email}</span>
                      <span className="mt-1 md:hidden">
                        {state ? (
                          <Status tone={state.tone}>{state.label}</Status>
                        ) : (
                          row.roles[0] && <Tag>{getRoleDisplayName(row.roles[0])}</Tag>
                        )}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className={cn(cellClass, wideOnly)}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {row.roles.map(role => (
                      <Tag key={role.id}>{getRoleDisplayName(role)}</Tag>
                    ))}
                    <span className="text-faint text-xs">{recordLine(row)}</span>
                  </span>
                </td>
                <td className={cn(cellClass, wideOnly, 'whitespace-nowrap')}>
                  {state && <Status tone={state.tone}>{state.label}</Status>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
