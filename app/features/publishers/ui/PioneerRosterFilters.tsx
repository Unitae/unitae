import { useSearchParams } from 'react-router'

import type { PioneerFilters } from '~/features/publishers/model/pioneer-filters'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { formatGroupName } from '~/shared/utils/format-group-name'

interface Props {
  filters: PioneerFilters
  groups: string[]
  /** Annual pioneers per pace, before filtering. */
  counts: Record<PioneerFilters['risk'], number>
}

/** The search, the paces with their counts and « Filtres » (the service, the group) on one row; the active filters below. */
export function PioneerRosterFilters({ filters, groups, counts }: Props) {
  const [params, setParams] = useSearchParams()
  const fields = pioneerFilterFields(groups)

  const chooseRisk = (risk: PioneerFilters['risk']) =>
    setParams(
      prev => {
        if (risk === 'all') prev.delete('risk')
        else prev.set('risk', risk)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <ListToolbar
      search={<SearchInput paramName="q" placeholder={m.pioneers_filters_search_placeholder()} />}
      views={
        <QuickViews
          label={m.pioneers_filters_risk_label()}
          views={[
            { value: 'all', label: m.activity_filter_all(), count: counts.all },
            { value: 'red', label: m.pioneers_risk_red(), count: counts.red },
            { value: 'amber', label: m.pioneers_risk_amber(), count: counts.amber },
            { value: 'green', label: m.pioneers_status_on_time(), count: counts.green },
          ]}
          value={filters.risk}
          onChoose={chooseRisk}
        />
      }
      filters={<FiltersPopover fields={fields} />}
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}

function pioneerFilterFields(groups: string[]): FilterField[] {
  const fields: FilterField[] = [
    {
      param: 'type',
      label: m.pioneers_filters_type_label(),
      allLabel: m.pioneers_filters_type_all(),
      options: [
        { value: PublisherType.PionnierPermanant, label: m.pioneers_type_permanent() },
        { value: PublisherType.PionnierAuxiliaires, label: m.pioneers_type_auxiliary() },
        { value: PublisherType.PionnierSpecial, label: m.pioneers_type_special() },
        { value: PublisherType.Missionnaire, label: m.pioneers_type_missionary() },
      ],
    },
  ]
  if (groups.length > 0) {
    fields.push({
      param: 'group',
      label: m.pioneers_filters_group_label(),
      allLabel: m.pioneers_filters_group_all(),
      options: groups.map(group => ({ value: group, label: formatGroupName(group) })),
    })
  }
  return fields
}
