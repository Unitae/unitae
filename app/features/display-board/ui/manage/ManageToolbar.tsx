import { ListFilter } from 'lucide-react'
import type { DisplayState } from '~/features/display-board/model/display-state'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { FilterMenu } from '~/shared/ui/filters/FilterMenu'
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

/** Search, the section, the state. Everything lives in the URL, like the other lists. */
export function ManageToolbar({ sections, canReorder }: ManageToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Takes the row's free width: sized from its content, the search field's 280px would not fit and wrap. */}
      <FilterBar paramNames={MANAGE_PARAMS} className="min-w-0 flex-1">
        <div className="min-w-[200px] flex-[0_1_280px] max-md:basis-full">
          <SearchInput paramName="q" placeholder={m.board_manage_search_placeholder()} />
        </div>
        <FilterMenu
          paramName="section"
          label={m.board_manage_filter_section()}
          icon={ListFilter}
          allLabel={m.board_manage_filter_section_all()}
          options={sections.map(section => ({ value: String(section.id), label: section.name }))}
        />
        <FilterMenu
          paramName="etat"
          label={m.board_manage_filter_state()}
          idleValue={m.board_manage_filter_state_any()}
          allLabel={m.board_manage_filter_state_all()}
          options={STATES.map(state => ({ value: state.value, label: state.label() }))}
        />
      </FilterBar>
      {canReorder && <span className="ml-auto text-faint text-sm max-md:hidden">{m.board_manage_drag_hint()}</span>}
    </div>
  )
}
