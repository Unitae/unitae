import { useSearchParams } from 'react-router'
import type { DisplayState } from '~/features/display-board/model/display-state'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { SearchInput } from '~/shared/ui/SearchInput'

export const MANAGE_PARAMS = ['q', 'section', 'etat'] as const

const STATES: { value: DisplayState['kind']; label: () => string }[] = [
  { value: 'shown', label: m.board_state_filter_shown },
  { value: 'scheduled', label: m.board_state_filter_scheduled },
  { value: 'expired', label: m.board_state_filter_expired },
  { value: 'unpublished', label: m.board_state_filter_unpublished },
]

interface ManageToolbarProps {
  sections: { id: number; name: string }[]
  /** Reordering is offered: say how. */
  canReorder: boolean
}

/** The search and one « Filtres » (section, state) on one row, the reorder hint at its end; the active filters below. */
export function ManageToolbar({ sections, canReorder }: ManageToolbarProps) {
  const [params] = useSearchParams()
  const fields: FilterField[] = [
    {
      param: 'section',
      label: m.board_manage_filter_section(),
      allLabel: m.board_manage_filter_section_all(),
      options: sections.map(section => ({ value: String(section.id), label: section.name })),
    },
    {
      param: 'etat',
      label: m.board_manage_filter_state(),
      allLabel: m.board_manage_filter_state_all(),
      options: STATES.map(state => ({ value: state.value, label: state.label() })),
    },
  ]

  return (
    <ListToolbar
      search={<SearchInput paramName="q" placeholder={m.board_manage_search_placeholder()} />}
      filters={<FiltersPopover fields={fields} />}
      sort={
        canReorder ? <span className="text-faint text-sm max-md:hidden">{m.board_manage_drag_hint()}</span> : undefined
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}
