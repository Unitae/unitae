import { useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { SortMenu } from '~/shared/ui/SortMenu'
import type { BuildingSort, BuildingView } from '../model/building-list'
import { TerritoryAccess } from '../model/territory-access.type'
import { TerritoryKindKey } from '../model/territory-kind.type'
import { accessLabel } from './building-list-labels'

interface BuildingToolbarProps {
  view: BuildingView
  counts: Record<BuildingView, number>
  onView: (view: BuildingView) => void
  sort: BuildingSort
  zips: string[]
}

/** Search, the five views, « Filtres » (postcode, contents, access, position) and the order; the filters as chips below. */
export function BuildingToolbar({ view, counts, onView, sort, zips }: BuildingToolbarProps) {
  const [params] = useSearchParams()
  const fields: FilterField[] = [
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
      param: 'type',
      label: m.prospection_filter_type(),
      allLabel: m.prospection_filter_type_all(),
      options: [
        { value: TerritoryKindKey.Classical, label: m.prospection_filter_type_homes() },
        { value: TerritoryKindKey.Phone, label: m.prospection_filter_type_phones() },
        { value: TerritoryKindKey.Commerces, label: m.prospection_filter_type_shops() },
        { value: TerritoryKindKey.Hotel, label: m.prospection_filter_type_hotel() },
        { value: TerritoryKindKey.Univ, label: m.prospection_filter_type_campus() },
      ],
    },
    {
      param: 'access',
      label: m.prospection_filter_access(),
      allLabel: m.prospection_filter_access_all(),
      options: [TerritoryAccess.Intercom, TerritoryAccess.Code, TerritoryAccess.Doorbell].map(access => ({
        value: String(access),
        label: accessLabel(access) ?? '',
      })),
    },
    {
      param: 'position',
      label: m.prospection_filter_position(),
      allLabel: m.prospection_filter_position_all(),
      options: [{ value: 'none', label: m.prospection_filter_position_none() }],
    },
  ]

  return (
    <ListToolbar
      search={<SearchInput paramName="search" placeholder={m.prospection_search_placeholder()} />}
      views={
        <QuickViews
          label={m.prospection_views_label()}
          views={[
            { value: 'active', label: m.prospection_view_active(), count: counts.active },
            { value: 'check', label: m.prospection_view_check(), count: counts.check },
            { value: 'new', label: m.prospection_view_new(), count: counts.new },
            { value: 'missing', label: m.prospection_view_missing(), count: counts.missing },
            { value: 'all', label: m.prospection_view_all(), count: counts.all },
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
            { value: 'address', label: m.prospection_sort_address() },
            { value: 'oldest', label: m.prospection_sort_oldest() },
            { value: 'recent', label: m.prospection_sort_recent() },
          ]}
        />
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}
