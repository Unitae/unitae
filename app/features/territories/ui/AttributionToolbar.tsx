import type { AttributionSort, AttributionView } from '~/features/territories/model/attribution-list'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { FilterBar } from '~/shared/ui/filters/FilterBar'
import { FilterMenu } from '~/shared/ui/filters/FilterMenu'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { formatGroupName } from '~/shared/utils/format-group-name'

import { SortMenu } from './SortMenu'

/** The filters that narrow the query: the search, the method, the campaign, the group. */
export const ATTRIBUTION_PARAMS = ['search', 'type', 'campaign', 'group'] as const

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

/** The search and the filters on one row, the quick views and the order on the next. Everything lives in the URL. */
export function AttributionToolbar(props: AttributionToolbarProps) {
  const { view, counts, onView, sort, proximity, phoneMethod, groups, campaigns } = props
  const views: { value: AttributionView; label: string }[] = [
    { value: 'all', label: m.attributions_view_all() },
    { value: 'late', label: m.attributions_view_late() },
    { value: 'paused', label: m.attributions_view_paused() },
    { value: 'orphaned', label: m.attributions_view_orphaned() },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <FilterBar paramNames={ATTRIBUTION_PARAMS}>
        <div className="min-w-[200px] flex-[0_1_280px] max-md:basis-full">
          <SearchInput paramName="search" placeholder={m.attributions_search_placeholder()} />
        </div>
        {phoneMethod && (
          <FilterMenu
            paramName="type"
            label={m.attributions_filter_mode()}
            allLabel={m.attributions_filter_mode_all()}
            options={[
              { value: TerritoryAttributionKind.Default, label: m.attributions_panel_mode_default() },
              { value: TerritoryAttributionKind.Phone, label: m.attributions_panel_mode_phone() },
            ]}
          />
        )}
        {campaigns.length > 0 && (
          <FilterMenu
            paramName="campaign"
            label={m.attributions_filter_campaign()}
            allLabel={m.attributions_filter_campaign_all()}
            options={[
              { value: 'outside', label: m.attributions_filter_campaign_outside() },
              { value: 'any', label: m.attributions_filter_campaign_any() },
              ...campaigns.map(campaign => ({ value: String(campaign.id), label: campaign.name })),
            ]}
          />
        )}
        {groups.length > 0 && (
          <FilterMenu
            paramName="group"
            label={m.attributions_filter_group()}
            allLabel={m.attributions_filter_group_all()}
            options={groups.map(group => ({ value: String(group.id), label: formatGroupName(group.name) }))}
          />
        )}
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <QuickViews
          label={m.attributions_views_label()}
          views={views.map(option => ({ ...option, count: counts[option.value] }))}
          value={view}
          onChoose={onView}
        />
        <span className="flex-1" />
        <SortMenu
          value={sort}
          options={[
            { value: 'date', label: m.attributions_sort_date() },
            { value: 'number', label: m.attributions_sort_number() },
            ...(proximity ? [{ value: 'proximity' as const, label: m.attributions_sort_proximity() }] : []),
          ]}
        />
      </div>
    </div>
  )
}
