import { Panel, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import { dayLabel } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

export interface TemplateRow {
  id: number
  key: string
  name: string
  color: string
  weekDay: number | null
  startTime: string
  endTime: string
  parts: number
  services: number
  responsibles: { id: number; key: string; name: string | null }[]
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-11 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'

function when(row: TemplateRow): string {
  if (row.weekDay == null) return m.settings_templates_one_time()
  return m.settings_templates_when({ day: dayLabel(row.weekDay), start: row.startTime, end: row.endTime })
}

function content(row: TemplateRow): string {
  const parts = m.settings_templates_parts({ count: row.parts })
  const services = m.settings_templates_services({ count: row.services })
  return `${parts} · ${services}`
}

/** Both tables share their columns, so the built-in rows line up under the congregation's. */
function Columns({ compact = false }: { compact?: boolean }) {
  // Beside the docked panel only the name and when columns show: they share the width.
  if (compact) {
    return (
      <colgroup>
        <col className="w-[58%]" />
        <col />
      </colgroup>
    )
  }
  return (
    <colgroup>
      <col className="md:w-[26%]" />
      <col className="md:w-[22%]" />
      <col className="md:w-[20%]" />
      <col />
    </colgroup>
  )
}

/** A template's name and colour; on a phone, when it happens under the name. Its link is stretched over the row. */
function TemplateName({
  row,
  when,
  selected,
}: {
  row: Pick<TemplateRow, 'id' | 'name' | 'color'>
  when: string
  selected: boolean
}) {
  return (
    <td className={cellClass}>
      <Link
        // It opens in the side panel (6b-2b), keeping the page's other parameters out.
        to={`/settings/templates?type=${row.id}`}
        aria-current={selected ? 'true' : undefined}
        data-row-primary
        className="flex items-center gap-2.5 font-medium outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{row.name}</span>
          <span className="font-normal text-faint text-xs md:hidden">{when}</span>
        </span>
      </Link>
    </td>
  )
}

const rowClass = 'group relative cursor-pointer transition-colors duration-(--u-duration-fast) hover:bg-hover'

/** The congregation's templates: their colour, when they happen, what they hold and who runs them. */
export function TemplateTable({
  rows,
  selectedId,
  compact,
}: {
  rows: TemplateRow[]
  /** The type open in the side panel. */
  selectedId: number | null
  /** Beside the docked panel: its name and when columns only. */
  compact: boolean
}) {
  const hide = compact ? 'hidden' : wideOnly
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm md:table-fixed">
        <Columns compact={compact} />
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.settings_templates_col_template()}</th>
            <th className={headClass}>{m.settings_templates_col_when()}</th>
            <th className={`${headClass} ${hide}`}>{m.settings_templates_col_content()}</th>
            <th className={`${headClass} ${hide}`}>{m.settings_templates_col_responsibles()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} onClick={openRowOnClick} className={cn(rowClass, row.id === selectedId && 'bg-selected')}>
              <TemplateName row={row} when={when(row)} selected={row.id === selectedId} />
              <td className={`${cellClass} ${wideOnly} truncate text-muted-foreground tabular-nums`}>{when(row)}</td>
              <td className={`${cellClass} ${hide} truncate text-muted-foreground`}>{content(row)}</td>
              <td className={`${cellClass} ${hide}`}>
                {row.responsibles.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {row.responsibles.map(role => (
                      <Tag key={role.id}>{getRoleDisplayName(role)}</Tag>
                    ))}
                  </span>
                ) : (
                  <span className="text-faint">{m.settings_templates_managers()}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The templates the app needs for its own concepts — today the freeform one, for one-off events: only their colour
 * changes. A one-off event is dated by whoever creates it, with its own name and hours; nobody is responsible for it, so
 * the last column stays empty (the table keeps the congregation's columns).
 */
export function BuiltInTemplates({
  rows,
  selectedId,
  compact,
}: {
  rows: TemplateRow[]
  selectedId: number | null
  compact: boolean
}) {
  if (rows.length === 0) return null
  const hide = compact ? 'hidden' : wideOnly
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {m.settings_templates_built_in()}
          <span className="font-normal text-faint text-sm">{m.settings_templates_built_in_hint()}</span>
        </span>
      }
    >
      <table className="w-full border-collapse text-sm md:table-fixed">
        <Columns compact={compact} />
        <tbody>
          {rows.map(row => {
            const happens = m.settings_templates_one_time()
            return (
              <tr
                key={row.id}
                onClick={openRowOnClick}
                className={cn(rowClass, row.id === selectedId && 'bg-selected')}
              >
                <TemplateName row={row} when={happens} selected={row.id === selectedId} />
                <td className={`${cellClass} ${wideOnly} truncate text-muted-foreground`}>{happens}</td>
                <td className={`${cellClass} ${hide} truncate text-muted-foreground`}>
                  {m.settings_templates_freeform_content()}
                </td>
                <td className={`${cellClass} ${hide} truncate text-faint`} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}
