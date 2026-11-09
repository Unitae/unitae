import { PMR_STATUSES, pmrStatusLabels } from '~/features/territories/model/pmr-status'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TerritorySort, TerritoryView } from '~/features/territories/model/territory-list'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { FilterMenu } from '~/shared/ui/filters/FilterMenu'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'

import { territoryKindLabel } from './my-territory-labels'
import { SortMenu } from './SortMenu'

export const TERRITORY_PARAMS = ['search', 'type', 'pmr'] as const

interface TerritoryToolbarProps {
  view: TerritoryView
  counts: Record<TerritoryView, number>
  onView: (view: TerritoryView) => void
  sort: TerritorySort
  proximity: boolean
  pmrActive: boolean
  /** The views and the « Dernière attribution » order read the attributions: a right of its own. */
  canViewAttributions: boolean
}

/** The search, the kind and the PMR access; then the quick views and the order. Everything lives in the URL. */
export function TerritoryToolbar(props: TerritoryToolbarProps) {
  const { view, counts, onView, sort, proximity, pmrActive, canViewAttributions } = props
  return (
    <div className="flex flex-col gap-2.5">
      <FilterBar paramNames={TERRITORY_PARAMS}>
        <div className="min-w-[200px] flex-[0_1_280px] max-md:basis-full">
          <SearchInput paramName="search" placeholder={m.territories_search_placeholder()} />
        </div>
        <FilterMenu
          paramName="type"
          label={m.attributions_assign_filter_kind()}
          allLabel={m.attributions_assign_filter_kind_all()}
          options={Object.values(TerritoryKindKey).map(kind => ({ value: kind, label: territoryKindLabel(kind) }))}
        />
        {pmrActive && (
          <FilterMenu
            paramName="pmr"
            label={m.territories_filter_pmr_label()}
            allLabel={m.territories_filter_pmr_all()}
            options={PMR_STATUSES.map(status => ({ value: status, label: pmrStatusLabels()[status] }))}
          />
        )}
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        {canViewAttributions && (
          <QuickViews
            label={m.territories_views_label()}
            views={[
              { value: 'all', label: m.attributions_assign_view_all(), count: counts.all },
              { value: 'free', label: m.attributions_assign_view_free(), count: counts.free },
              { value: 'out', label: m.territories_view_out(), count: counts.out },
              { value: 'late', label: m.attributions_view_late(), count: counts.late },
            ]}
            value={view}
            onChoose={onView}
          />
        )}
        <span className="flex-1" />
        <SortMenu
          value={sort}
          options={[
            { value: 'number', label: m.attributions_sort_number() },
            ...(canViewAttributions ? [{ value: 'last' as const, label: m.attributions_assign_sort_last() }] : []),
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      </div>
    </div>
  )
}
