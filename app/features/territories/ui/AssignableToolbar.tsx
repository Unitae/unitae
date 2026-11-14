import { useSearchParams } from 'react-router'

import type { AssignableSort, AssignableView } from '~/features/territories/model/assignable-territories'
import { pmrStatusLabels } from '~/features/territories/model/pmr-status'
import { TerritoryAccess } from '~/features/territories/model/territory-access.type'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { SortMenu } from '~/shared/ui/SortMenu'
import { accessLabel } from './building-list-labels'
import { territoryKindLabel } from './my-territory-labels'

interface AssignableToolbarProps {
  view: AssignableView
  counts: Record<AssignableView, number>
  onView: (view: AssignableView) => void
  sort: AssignableSort
  /** A searched place was found: the proximity order is offered. */
  proximity: boolean
  kinds: TerritoryKindKey[]
  /** The postcodes of the congregation's buildings; the filter only shows when there is a choice. */
  zips: string[]
  pmrActive: boolean
}

/**
 * Search, « Disponibles / Tous », « Filtres » (kind, postcode, access, PMR) and the order on one row; the active
 * filters below.
 */
export function AssignableToolbar(props: AssignableToolbarProps) {
  const { view, counts, onView, sort, proximity, kinds, zips, pmrActive } = props
  const [params] = useSearchParams()
  const fields: FilterField[] = [
    {
      param: 'type',
      label: m.attributions_assign_filter_kind(),
      allLabel: m.attributions_assign_filter_kind_all(),
      options: kinds.map(kind => ({ value: kind, label: territoryKindLabel(kind) })),
    },
    ...(zips.length > 1
      ? [
          {
            param: 'zip',
            label: m.prospection_filter_zip(),
            allLabel: m.prospection_filter_zip_all(),
            options: zips.map(zip => ({ value: zip, label: zip })),
          },
        ]
      : []),
    {
      param: 'access',
      label: m.prospection_filter_access(),
      allLabel: m.prospection_filter_access_all(),
      options: [TerritoryAccess.Intercom, TerritoryAccess.Code, TerritoryAccess.Doorbell].map(access => ({
        value: String(access),
        label: accessLabel(access) ?? '',
      })),
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
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}
