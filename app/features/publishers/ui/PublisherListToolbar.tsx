import { useSearchParams } from 'react-router'
import {
  NO_GROUP_PARAM,
  PRIVILEGES,
  type PublisherListFilters,
  type PublisherSort,
  type PublisherStatus,
  publisherSortOptions,
} from '~/features/publishers/model/publisher-list-filters'
import { privilegeFilterLabel } from '~/features/publishers/ui/publisher-list-format'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { SortMenu } from '~/shared/ui/SortMenu'
import { formatGroupName } from '~/shared/utils/format-group-name'

const SORT_LABEL: Record<PublisherSort, () => string> = {
  name: m.publishers_sort_name,
  group: m.publishers_sort_group,
  departure: m.publishers_sort_departure,
}

export interface PublisherGroupOption {
  id: number
  name: string
}

interface PublisherListToolbarProps {
  groups: PublisherGroupOption[]
  filters: PublisherListFilters
  /** How many each list holds under the search, groups and privilege chosen. */
  counts: Record<PublisherStatus, number>
}

/**
 * The search, the three lists (actifs, inactifs, partis) with their counts, « Filtres » (groups, privilege) and the
 * order, on one row; the active filters below. Everything lives in the address.
 */
export function PublisherListToolbar({ groups, filters, counts }: PublisherListToolbarProps) {
  const [params, setParams] = useSearchParams()
  const fields = publisherFilterFields(groups)

  // The default list leaves the address clean; each list has its own orders, so the order starts again.
  const chooseStatus = (status: PublisherStatus) =>
    setParams(
      prev => {
        if (status === 'active') prev.delete('status')
        else prev.set('status', status)
        prev.delete('sort')
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <ListToolbar
      search={<SearchInput paramName="q" placeholder={m.publishers_search_placeholder()} />}
      views={
        <QuickViews
          label={m.publishers_filter_status_label()}
          views={[
            { value: 'active', label: m.publishers_status_active(), count: counts.active },
            { value: 'inactive', label: m.publishers_status_inactive(), count: counts.inactive },
            { value: 'left', label: m.publishers_status_left(), count: counts.left },
          ]}
          value={filters.status}
          onChoose={chooseStatus}
        />
      }
      filters={<FiltersPopover fields={fields} />}
      sort={
        <SortMenu
          value={filters.sort}
          options={publisherSortOptions(filters.status).map(sort => ({ value: sort, label: SORT_LABEL[sort]() }))}
        />
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}

function publisherFilterFields(groups: PublisherGroupOption[]): FilterField[] {
  return [
    {
      param: 'group',
      label: m.activity_filters_group_label(),
      allLabel: m.activity_filters_group_all(),
      multiple: true,
      options: [
        ...groups.map(group => ({ value: String(group.id), label: formatGroupName(group.name) })),
        { value: NO_GROUP_PARAM, label: m.publishers_move_no_group() },
      ],
    },
    {
      param: 'privilege',
      label: m.publishers_filter_privilege_label(),
      allLabel: m.publishers_filter_privilege_all(),
      options: PRIVILEGES.map(privilege => ({ value: privilege, label: privilegeFilterLabel(privilege) })),
    },
  ]
}
