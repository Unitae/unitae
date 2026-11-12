import { useSearchParams } from 'react-router'

import type { ActivityFilters, ActivityStatusFilter } from '~/features/publishers/model/filter-publisher-activities'
import { type ReportMonthRow, reportStatus } from '~/features/publishers/model/report-month'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { FilterChipBar } from '~/shared/ui/filters/FilterChipBar'
import { FiltersPopover } from '~/shared/ui/filters/FiltersPopover'
import { activeFilterChips, type FilterField } from '~/shared/ui/filters/filter-fields'
import { useMediaQuery } from '~/shared/ui/hooks/use-media-query'
import { ListToolbar } from '~/shared/ui/ListToolbar'
import { QuickViews } from '~/shared/ui/QuickViews'
import { SearchInput } from '~/shared/ui/SearchInput'
import { formatGroupName } from '~/shared/utils/format-group-name'

import { serviceLabel } from './publisher-type-labels'

const TYPES = [
  PublisherType.Normal,
  PublisherType.PionnierAuxiliaires,
  PublisherType.PionnierPermanant,
  PublisherType.PionnierSpecial,
  PublisherType.Missionnaire,
]

/** From this width the group strip above the list picks the group, so « Filtres » leaves it out. */
const GROUP_STRIP = '(min-width: 1024px)'

function countByStatus(rows: ReportMonthRow[]): Record<ActivityStatusFilter, number> {
  const counts = { all: rows.length, filed: 0, 'not-filed': 0, irregular: 0, inactive: 0 }
  for (const row of rows) {
    const status = reportStatus(row)
    if (status === 'missing') counts['not-filed']++
    else if (status === 'not-preached') counts.irregular++
    else if (status === 'inactive') counts.inactive++
    else counts.filed++
  }
  return counts
}

interface ActivityReportFiltersProps {
  filters: ActivityFilters
  /** Every row of the month, to count each status before filtering. */
  rows: ReportMonthRow[]
  groups: { id: number; name: string }[]
}

/**
 * The search, the report statuses with their counts and « Filtres » (the service, and the groups where the strip
 * above does not show) on one row; the active filters below.
 */
export function ActivityReportFilters({ filters, rows, groups }: ActivityReportFiltersProps) {
  const [params, setParams] = useSearchParams()
  const counts = countByStatus(rows)
  const strip = useMediaQuery(GROUP_STRIP) === true
  const fields = activityFilterFields(strip ? [] : groups)

  const chooseStatus = (status: ActivityStatusFilter) =>
    setParams(
      prev => {
        if (status === 'all') prev.delete('status')
        else prev.set('status', status)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <ListToolbar
      search={<SearchInput paramName="q" placeholder={m.activity_filters_search_placeholder()} />}
      views={
        <QuickViews
          label={m.activity_filter_status_label()}
          views={[
            { value: 'all', label: m.activity_filter_all(), count: counts.all },
            { value: 'not-filed', label: m.activity_status_missing(), count: counts['not-filed'] },
            { value: 'irregular', label: m.activity_filter_not_preached(), count: counts.irregular },
            { value: 'inactive', label: m.activity_filter_inactive(), count: counts.inactive },
          ]}
          value={filters.status === 'filed' ? 'all' : filters.status}
          onChoose={chooseStatus}
        />
      }
      filters={<FiltersPopover fields={fields} />}
      chips={<FilterChipBar chips={activeFilterChips(fields, params)} clearParams={fields.map(field => field.param)} />}
    />
  )
}

function activityFilterFields(groups: { id: number; name: string }[]): FilterField[] {
  const fields: FilterField[] = [
    {
      param: 'type',
      label: m.activity_filters_type_label(),
      allLabel: m.activity_filters_type_all(),
      options: TYPES.map(type => ({ value: type, label: serviceLabel(type) })),
    },
  ]
  if (groups.length > 0) {
    fields.push({
      param: 'group',
      label: m.activity_filters_group_label(),
      allLabel: m.activity_filters_group_all(),
      multiple: true,
      options: groups.map(group => ({ value: String(group.id), label: formatGroupName(group.name) })),
    })
  }
  return fields
}
