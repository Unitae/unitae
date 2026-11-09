import type { AssignableSort, AssignableView } from '~/features/territories/model/assignable-territories'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { FilterMenu } from '~/shared/ui/filters/FilterMenu'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'

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

/** The search and the kind of territory, then « Disponibles / Tous » and the order. Everything lives in the URL. */
export function AssignableToolbar({ view, counts, onView, sort, proximity, kinds }: AssignableToolbarProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <FilterBar paramNames={['search', 'type']}>
        <div className="min-w-[200px] flex-[0_1_280px] max-md:basis-full">
          <SearchInput paramName="search" placeholder={m.attributions_assign_search_placeholder()} />
        </div>
        <FilterMenu
          paramName="type"
          label={m.attributions_assign_filter_kind()}
          allLabel={m.attributions_assign_filter_kind_all()}
          options={kinds.map(kind => ({ value: kind, label: territoryKindLabel(kind) }))}
        />
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <QuickViews
          label={m.attributions_assign_views_label()}
          views={[
            { value: 'free', label: m.attributions_assign_view_free(), count: counts.free },
            { value: 'all', label: m.attributions_assign_view_all(), count: counts.all },
          ]}
          value={view}
          onChoose={onView}
        />
        <span className="flex-1" />
        <SortMenu
          value={sort}
          options={[
            { value: 'last', label: m.attributions_assign_sort_last() },
            { value: 'number', label: m.attributions_sort_number() },
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      </div>
    </div>
  )
}
