import { Panel, Tag } from '@unitae/ui'
import { Link } from 'react-router'
import { dayLabel, EventTemplateKey } from '~/features/events'
import * as m from '~/i18n/paraglide/messages'
import { getRoleDisplayName } from '~/shared/types/role'

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
  const parts =
    row.parts === 1 ? m.settings_templates_parts_one() : m.settings_templates_parts_many({ count: String(row.parts) })
  const services =
    row.services === 1
      ? m.settings_templates_services_one()
      : m.settings_templates_services_many({ count: String(row.services) })
  return `${parts} · ${services}`
}

/** The congregation's templates: their colour, when they happen, what they hold and who runs them. */
export function TemplateTable({ rows }: { rows: TemplateRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.settings_templates_col_template()}</th>
            <th className={headClass}>{m.settings_templates_col_when()}</th>
            <th className={headClass}>{m.settings_templates_col_content()}</th>
            <th className={headClass}>{m.settings_templates_col_responsibles()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group relative transition-colors duration-(--u-duration-fast) hover:bg-hover">
              <td className={cellClass}>
                <Link
                  to={`/settings/templates/${row.id}`}
                  className="flex items-center gap-2.5 font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.name}</span>
                    <span className="font-normal text-faint text-xs md:hidden">{when(row)}</span>
                  </span>
                </Link>
              </td>
              <td className={`${cellClass} ${wideOnly} whitespace-nowrap text-muted-foreground tabular-nums`}>
                {when(row)}
              </td>
              <td className={`${cellClass} ${wideOnly} whitespace-nowrap text-muted-foreground`}>{content(row)}</td>
              <td className={`${cellClass} ${wideOnly}`}>
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

/** The templates the app needs for its own concepts (absences, one-off events): only their colour changes. */
export function BuiltInTemplates({ rows }: { rows: TemplateRow[] }) {
  if (rows.length === 0) return null
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-baseline gap-x-2">
          {m.settings_templates_built_in()}
          <span className="font-normal text-faint text-sm">{m.settings_templates_built_in_hint()}</span>
        </span>
      }
    >
      {rows.map(row => {
        const dayOff = row.key === EventTemplateKey.DayOff
        return (
          <Link
            key={row.id}
            to={`/settings/templates/${row.id}`}
            className="flex items-center gap-3 border-t px-4.5 py-2.5 outline-none transition-colors first:border-t-0 hover:bg-hover focus-visible:bg-hover"
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="min-w-0 flex-1 font-medium text-sm">{row.name}</span>
            <span className="text-faint text-sm max-sm:hidden">
              {dayOff ? m.settings_templates_day_off_when() : m.settings_templates_one_time()}
            </span>
            <span className="w-40 text-right text-muted-foreground text-sm max-sm:hidden">
              {dayOff ? m.settings_templates_day_off_content() : m.settings_templates_freeform_content()}
            </span>
          </Link>
        )
      })}
    </Panel>
  )
}
