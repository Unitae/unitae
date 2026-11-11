import { Tag } from '@unitae/ui'
import * as m from '~/i18n/paraglide/messages'
import { cn } from '~/shared/utils/utils'

export interface PartTypeRow {
  id: number
  name: string
  speaker: string
  reader: string | null
  isSystem: boolean
  usage: number
}

const headClass = 'h-10 whitespace-nowrap border-border border-b px-3.5 text-left font-medium text-faint text-sm'
const cellClass = 'h-10 border-border border-b px-3.5 group-last:border-b-0'
const wideOnly = 'max-md:hidden'

interface PartTypeTableProps {
  rows: PartTypeRow[]
  selectedId: number | null
  onSelect: (row: PartTypeRow, trigger: HTMLElement) => void
}

/** The part types: who does the part, the second person if any, how many parts use the type. A row opens it. */
export function PartTypeTable({ rows, selectedId, onSelect }: PartTypeTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className={wideOnly}>
          <tr>
            <th className={headClass}>{m.settings_part_types_col_type()}</th>
            <th className={headClass}>{m.settings_part_types_col_speaker()}</th>
            <th className={headClass}>{m.settings_part_types_col_reader()}</th>
            <th className={cn(headClass, 'text-right')}>{m.settings_part_types_col_used()}</th>
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
              <td className={cellClass}>
                <button
                  type="button"
                  aria-pressed={row.id === selectedId}
                  onClick={event => onSelect(row, event.currentTarget)}
                  className="flex items-center gap-2 whitespace-nowrap text-left font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  {row.name}
                  {row.isSystem && <Tag>{m.settings_part_types_built_in()}</Tag>}
                </button>
              </td>
              <td className={cn(cellClass, wideOnly, 'text-muted-foreground')}>{row.speaker}</td>
              <td className={cn(cellClass, wideOnly, 'text-muted-foreground')}>
                {row.reader ?? <span className="text-faint">—</span>}
              </td>
              <td className={cn(cellClass, wideOnly, 'text-right text-muted-foreground tabular-nums')}>{row.usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
