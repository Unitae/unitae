import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

/** A schedule template as its row says it: its title, its kind and content, who answers for it, how many kinds. */
export interface ScheduleTemplateRow {
  id: number
  title: string
  /** « Spirituel · 15 parties », « Services · 4 services ». */
  detail: string
  responsible: string | null
  kinds: number
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-12 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'

/** The schedule templates (design round A, « TourA-Reglages-Modeles »). A row opens it in the side panel. */
export function ScheduleTemplateTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ScheduleTemplateRow[]
  selectedId: number | null
  onSelect: (row: ScheduleTemplateRow, trigger: HTMLElement) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.settings_schedule_templates_name()}</th>
            <th className={cn(headClass, 'docked:hidden')}>{m.settings_schedule_templates_responsible()}</th>
            <th className={cn(headClass, 'text-right')}>{m.settings_schedule_templates_suggested_by()}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              onClick={openRowOnClick}
              key={row.id}
              className={cn(
                'group relative cursor-pointer transition-colors duration-(--u-duration-fast)',
                row.id === selectedId ? 'bg-selected' : 'hover:bg-hover',
              )}
            >
              <td className={cellClass}>
                <button
                  type="button"
                  aria-pressed={row.id === selectedId}
                  onClick={event => onSelect(row, event.currentTarget)}
                  data-row-primary
                  className="flex flex-col items-start rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{row.title}</span>
                  <span className="text-faint text-xs tabular-nums">{row.detail}</span>
                </button>
              </td>
              <td
                className={cn(
                  cellClass,
                  wideOnly,
                  'docked:hidden',
                  row.responsible == null ? 'text-faint' : 'text-muted-foreground',
                )}
              >
                {row.responsible ?? m.settings_schedule_templates_responsible_none()}
              </td>
              <td className={cn(cellClass, 'text-right text-faint tabular-nums')}>
                {row.kinds === 0
                  ? m.settings_schedule_templates_kinds_none()
                  : m.settings_schedule_templates_kinds({ count: row.kinds })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
