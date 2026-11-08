import { useSearchParams } from 'react-router'
import {
  PRIVILEGES,
  type Privilege,
  type PublisherListFilters,
  type PublisherStatus,
} from '~/features/publishers/model/publisher-list-filters'
import { PublisherGroupFilter, type PublisherGroupOption } from '~/features/publishers/ui/PublisherGroupFilter'
import { privilegeFilterLabel } from '~/features/publishers/ui/publisher-list-format'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

const PARAM_NAMES = ['q', 'group', 'privilege', 'status'] as const

const STATUS_LABEL: Record<PublisherStatus, () => string> = {
  active: m.publishers_status_active,
  inactive: m.publishers_status_inactive,
  left: m.publishers_status_left,
}

interface PublisherListToolbarProps {
  groups: PublisherGroupOption[]
  filters: PublisherListFilters
}

/** Search, then the three filters of the list, then how it is sorted. Everything lives in the URL. */
export function PublisherListToolbar({ groups, filters }: PublisherListToolbarProps) {
  const [, setSearchParams] = useSearchParams()

  // The default value leaves the URL clean: no parameter means every active publisher.
  const setParam = (name: 'privilege' | 'status', value: string, fallback: string) =>
    setSearchParams(
      prev => {
        if (value === fallback) prev.delete(name)
        else prev.set(name, value)
        return prev
      },
      { replace: true },
    )

  return (
    <FilterBar paramNames={PARAM_NAMES}>
      <div className="min-w-[200px] flex-[0_1_280px]">
        <SearchInput paramName="q" placeholder={m.publishers_search_placeholder()} />
      </div>

      <PublisherGroupFilter groups={groups} selectedIds={filters.groupIds} />

      <Select value={filters.privilege ?? 'all'} onValueChange={value => setParam('privilege', value, 'all')}>
        <SelectTrigger aria-label={m.publishers_filter_privilege_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.publishers_filter_privilege_all()}</SelectItem>
          {PRIVILEGES.map((privilege: Privilege) => (
            <SelectItem key={privilege} value={privilege}>
              {privilegeFilterLabel(privilege)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={value => setParam('status', value, 'active')}>
        <SelectTrigger aria-label={m.publishers_filter_status_label()}>
          <span className="text-muted-foreground">{m.publishers_filter_status_label()}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as PublisherStatus[]).map(status => (
            <SelectItem key={status} value={status}>
              {STATUS_LABEL[status]()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="ml-auto text-faint text-sm max-md:hidden">
        {filters.status === 'left' ? m.publishers_sorted_by_departure() : m.publishers_sorted_by_name()}
      </span>
    </FilterBar>
  )
}
