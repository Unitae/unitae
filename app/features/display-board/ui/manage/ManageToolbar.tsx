import { useSearchParams } from 'react-router'
import type { DisplayState } from '~/features/display-board/model/display-state'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const setParam = (name: 'section' | 'etat', value: string) =>
    setSearchParams(
      prev => {
        if (value === 'all') prev.delete(name)
        else prev.set(name, value)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterBar paramNames={MANAGE_PARAMS}>
        <div className="min-w-[200px] flex-[0_1_280px]">
          <SearchInput paramName="q" placeholder={m.board_manage_search_placeholder()} />
        </div>
        <Select value={searchParams.get('section') ?? 'all'} onValueChange={value => setParam('section', value)}>
          <SelectTrigger aria-label={m.board_manage_filter_section()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.board_manage_filter_section_all()}</SelectItem>
            {sections.map(section => (
              <SelectItem key={section.id} value={String(section.id)}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get('etat') ?? 'all'} onValueChange={value => setParam('etat', value)}>
          <SelectTrigger aria-label={m.board_manage_filter_state()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.board_manage_filter_state_all()}</SelectItem>
            {STATES.map(state => (
              <SelectItem key={state.value} value={state.value}>
                {state.label()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>
      {canReorder && <span className="ml-auto text-faint text-sm max-md:hidden">{m.board_manage_drag_hint()}</span>}
    </div>
  )
}
