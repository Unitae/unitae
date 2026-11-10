import { useSearchParams } from 'react-router'

import { pmrStatusLabels } from '~/features/territories/model/pmr-status'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import type { TerritorySort, TerritoryView } from '~/features/territories/model/territory-list'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'

import { ListToolbar } from './ListToolbar'
import { territoryKindLabel } from './my-territory-labels'
import { SortMenu } from './SortMenu'

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

/** Search, the quick views, « Filtres » (kind, PMR access) and the order on one row; the active filters below. */
export function TerritoryToolbar(props: TerritoryToolbarProps) {
  const { view, counts, onView, sort, proximity, pmrActive, canViewAttributions } = props
  const [params] = useSearchParams()
  const fields: FilterField[] = [
    {
      param: 'type',
      label: m.attributions_assign_filter_kind(),
      allLabel: m.attributions_assign_filter_kind_all(),
      options: Object.values(TerritoryKindKey).map(kind => ({ value: kind, label: territoryKindLabel(kind) })),
    },
    ...(pmrActive
      ? [
          {
            param: 'pmr',
            label: m.territories_filter_pmr_label(),
            allLabel: m.territories_filter_pmr_all(),
            // The same words as the rows' tags.
            options: [
              { value: 'full', label: m.attributions_assign_pmr() },
              { value: 'partial', label: m.attributions_assign_pmr_partial() },
              { value: 'not', label: pmrStatusLabels().not },
            ],
          },
        ]
      : []),
  ]

  return (
    <ListToolbar
      search={<SearchInput paramName="search" placeholder={m.territories_search_placeholder()} />}
      views={
        canViewAttributions && (
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
        )
      }
      filters={<FiltersPopover fields={fields} />}
      sort={
        <SortMenu
          value={sort}
          options={[
            { value: 'number', label: m.attributions_sort_number() },
            ...(canViewAttributions ? [{ value: 'last' as const, label: m.attributions_assign_sort_last() }] : []),
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}
