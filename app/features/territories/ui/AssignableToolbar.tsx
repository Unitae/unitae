import { useSearchParams } from 'react-router'

import type { AssignableSort, AssignableView } from '~/features/territories/model/assignable-territories'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'

import { ListToolbar } from './ListToolbar'
import { territoryKindLabel } from './my-territory-labels'
import { SortMenu } from './SortMenu'

interface AssignableToolbarProps {
  view: AssignableView
  counts: Record<AssignableView, number>
  onView: (view: AssignableView) => void
  sort: AssignableSort
  /** A searched place was found: the proximity order is offered. */
  proximity: boolean
  kinds: TerritoryKindKey[]
}

/** Search, « Disponibles / Tous », « Filtres » (the kind) and the order on one row; the active filters below. */
export function AssignableToolbar({ view, counts, onView, sort, proximity, kinds }: AssignableToolbarProps) {
  const [params] = useSearchParams()
  const fields: FilterField[] = [
    {
      param: 'type',
      label: m.attributions_assign_filter_kind(),
      allLabel: m.attributions_assign_filter_kind_all(),
      options: kinds.map(kind => ({ value: kind, label: territoryKindLabel(kind) })),
    },
  ]

  return (
    <ListToolbar
      search={<SearchInput paramName="search" placeholder={m.attributions_assign_search_placeholder()} />}
      views={
        <QuickViews
          label={m.attributions_assign_views_label()}
          views={[
            { value: 'free', label: m.attributions_assign_view_free(), count: counts.free },
            { value: 'all', label: m.attributions_assign_view_all(), count: counts.all },
          ]}
          value={view}
          onChoose={onView}
        />
      }
      filters={<FiltersPopover fields={fields} />}
      sort={
        <SortMenu
          value={sort}
          options={[
            { value: 'last', label: m.attributions_assign_sort_last() },
            { value: 'number', label: m.attributions_sort_number() },
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={['type']} />}
    />
  )
}
