import type { ScheduleTemplateView } from '~/features/settings/model/schedule-template-view'
import * as m from '~/i18n/paraglide/messages'
import { openRowOnClick } from '~/shared/ui/row-click'
import { cn } from '~/shared/utils/utils'

/** A schedule template as its row says it: its title, its kind and content, who answers for it, which kinds. */
export type ScheduleTemplateRow = Pick<ScheduleTemplateView, 'id' | 'title' | 'detail' | 'responsible' | 'suggestedBy'>

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
              {/* Three lines on a phone: room above and below them. */}
              <td className={cn(cellClass, 'max-md:h-auto max-md:py-2.5')}>
                <button
                  type="button"
                  aria-pressed={row.id === selectedId}
                  onClick={event => onSelect(row, event.currentTarget)}
                  data-row-primary
                  className="flex flex-col items-start rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{row.title}</span>
                  <span className="text-faint text-xs tabular-nums">
                    {row.detail}
                    {/* On a phone the kinds column is gone: the kind joins this line, unless the title says it. */}
                    {row.suggestedBy !== row.title && <span className="md:hidden"> · {row.suggestedBy}</span>}
                  </span>
                  {/* And so is the responsible's: its own line, a faint « Aucun » without one, as the board draws it. */}
                  <span
                    className={cn(
                      'text-xs md:hidden',
                      row.responsible == null ? 'text-faint' : 'text-muted-foreground',
                    )}
                  >
                    {row.responsible ?? m.settings_schedule_templates_responsible_none_short()}
                  </span>
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
              <td className={cn(cellClass, wideOnly, 'text-right text-muted-foreground')}>{row.suggestedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
