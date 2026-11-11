import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

/** A line of the audit log, as the page shows it. */
export interface AuditLogRow {
  id: number
  /** Short, in the congregation's time zone: « 11 nov. 00:39 ». */
  when: string
  /** In full, for the detail: « 11 novembre 2026 à 00:39:26 ». */
  fullDate: string
  person: string
  email: string | null
  action: string
  object: string
  details: { key: string; value: string }[]
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'

interface AuditLogTableProps {
  rows: AuditLogRow[]
  selectedId: number | null
  onSelect: (row: AuditLogRow, trigger: HTMLElement) => void
}

/** The audit log: when, who, what, on which object. A row opens its detail; on a phone, the action over who and when. */
export function AuditLogTable({ rows, selectedId, onSelect }: AuditLogTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={cn(headClass, 'w-36')}>{m.audit_log_col_when()}</th>
            <th className={headClass}>{m.audit_log_col_person()}</th>
            <th className={headClass}>{m.audit_log_col_action()}</th>
            <th className={headClass}>{m.audit_log_col_object()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              className={cn(
                'group relative transition-colors duration-(--u-duration-fast)',
                row.id === selectedId ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              <td className={cn(cellClass, wideOnly, 'whitespace-nowrap text-muted-foreground tabular-nums')}>
                {row.when}
              </td>
              <td className={cn(cellClass, wideOnly, 'max-w-56 truncate')}>{row.person}</td>
              <td className={cn(cellClass, 'max-md:py-2.5')}>
                <button
                  type="button"
                  aria-pressed={row.id === selectedId}
                  onClick={event => onSelect(row, event.currentTarget)}
                  className="flex flex-col text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  <span>{row.action}</span>
                  <span className="truncate text-faint text-xs md:hidden">
                    {row.person} · <span className="tabular-nums">{row.when}</span>
                  </span>
                </button>
              </td>
              <td className={cn(cellClass, wideOnly, 'whitespace-nowrap text-muted-foreground')}>{row.object}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** What the detail panel says about a line: who, their address, the object, then what the action recorded. */
export function AuditEntryDetail({ row }: { row: AuditLogRow }) {
  const entries = [
    { key: m.audit_log_col_person(), value: row.person },
    ...(row.email && row.email !== row.person ? [{ key: m.audit_log_col_email(), value: row.email }] : []),
    { key: m.audit_log_col_object(), value: row.object },
    ...row.details,
  ]
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
      {entries.map(entry => (
        <div key={entry.key} className="contents">
          <dt className="text-muted-foreground">{entry.key}</dt>
          <dd className="break-words">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}
