import { Avatar, Status, type StatusTone, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import type { UserAccountRow } from '~/features/settings/server/user-accounts.queries'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { getRoleDisplayName } from '~/shared/types/role'
import { openRowOnClick } from '~/shared/ui/row-click'
import { formatPersonName } from '~/shared/utils/format-person-name'
import { cn } from '~/shared/utils/utils'

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'
/** The roles shown on the row; the others are counted, so the row stays one line. */
const SHOWN_ROLES = 2

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
 * The accounts as a table, one line each: the person and the e-mail, the account's own roles and those its record
 * gives, its state. A row opens the account (its name is the link, stretched over the row). On a phone, the name over
 * its state or first role.
 */
export function UserAccountsTable({ rows }: { rows: UserAccountRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm md:table-fixed">
        <thead className={wideOnly}>
          <tr>
            <th className={cn(headClass, 'w-[45%]')}>{m.settings_users_col_person()}</th>
            <th className={headClass}>{m.settings_users_col_roles()}</th>
            <th className={cn(headClass, 'w-36')}>{m.settings_users_col_state()}</th>
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
                <td className={cn(cellClass, 'max-md:py-2')}>
                  <Link
                    to={`/settings/users/${row.id}`}
                    data-row-primary
                    className="flex items-center gap-3 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar name={name} size="sm" className={cn(muted && 'opacity-60')} />
                    <span className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-2">
                      <span className={cn('truncate font-medium', muted && 'text-muted-foreground')}>{name}</span>
                      {row.email !== name && (
                        <span className="truncate text-faint text-xs max-md:hidden">{row.email}</span>
                      )}
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
                  <RolesLine row={row} />
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

/** The account's first roles, then how many more, then what its record gives: on one line. */
function RolesLine({ row }: { row: UserAccountRow }) {
  const more = row.roles.slice(SHOWN_ROLES)
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {row.roles.slice(0, SHOWN_ROLES).map(role => (
        <span key={role.id} className="flex min-w-0 shrink">
          <Tag className="max-w-full">
            <span className="min-w-0 truncate">{getRoleDisplayName(role)}</span>
          </Tag>
        </span>
      ))}
      {more.length > 0 && (
        <span className="shrink-0" title={new Intl.ListFormat(getLocale()).format(more.map(getRoleDisplayName))}>
          <Tag>+{more.length}</Tag>
        </span>
      )}
      <span className="min-w-0 truncate text-faint text-xs">{recordLine(row)}</span>
    </span>
  )
}
