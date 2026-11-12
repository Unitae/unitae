import { useSearchParams } from 'react-router'

import type { AttributionSort, AttributionView } from '~/features/territories/model/attribution-list'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { SortMenu } from '~/shared/ui/SortMenu'
import { formatGroupName } from '~/shared/utils/format-group-name'

interface AttributionToolbarProps {
  view: AttributionView
  counts: Record<AttributionView, number>
  onView: (view: AttributionView) => void
  sort: AttributionSort
  /** A searched place was found: the proximity order is offered. */
  proximity: boolean
  phoneMethod: boolean
  groups: { id: number; name: string }[]
  campaigns: { id: number; name: string }[]
}

/** Search, the quick views, « Filtres » (method, campaign, group) and the order on one row; the active filters below. */
export function AttributionToolbar(props: AttributionToolbarProps) {
  const { view, counts, onView, sort, proximity, phoneMethod, groups, campaigns } = props
  const [params] = useSearchParams()
  const fields = attributionFilterFields({ phoneMethod, groups, campaigns })

  return (
    <ListToolbar
      search={<SearchInput paramName="search" placeholder={m.attributions_search_placeholder()} />}
      views={
        <QuickViews
          label={m.attributions_views_label()}
          views={[
            { value: 'all', label: m.attributions_view_all(), count: counts.all },
            { value: 'late', label: m.attributions_view_late(), count: counts.late },
            { value: 'paused', label: m.attributions_view_paused(), count: counts.paused },
            { value: 'orphaned', label: m.attributions_view_orphaned(), count: counts.orphaned },
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
            { value: 'date', label: m.attributions_sort_date() },
            { value: 'number', label: m.attributions_sort_number() },
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      }
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}

function attributionFilterFields({
  phoneMethod,
  groups,
  campaigns,
}: Pick<AttributionToolbarProps, 'phoneMethod' | 'groups' | 'campaigns'>): FilterField[] {
  const fields: FilterField[] = []
  if (phoneMethod) {
    fields.push({
      param: 'type',
      label: m.attributions_filter_mode(),
      allLabel: m.attributions_filter_mode_all(),
      options: [
        { value: TerritoryAttributionKind.Default, label: m.attributions_panel_mode_default() },
        { value: TerritoryAttributionKind.Phone, label: m.attributions_panel_mode_phone() },
      ],
    })
  }
  if (campaigns.length > 0) {
    fields.push({
      param: 'campaign',
      label: m.attributions_filter_campaign(),
      allLabel: m.attributions_filter_campaign_all(),
      options: [
        { value: 'outside', label: m.attributions_filter_campaign_outside() },
        { value: 'any', label: m.attributions_filter_campaign_any() },
        ...campaigns.map(campaign => ({ value: String(campaign.id), label: campaign.name })),
      ],
    })
  }
  if (groups.length > 0) {
    fields.push({
      param: 'group',
      label: m.attributions_filter_group(),
      allLabel: m.attributions_filter_group_all(),
      options: groups.map(group => ({ value: String(group.id), label: formatGroupName(group.name) })),
    })
  }
  return fields
}
