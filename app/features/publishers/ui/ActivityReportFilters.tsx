import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'

import {
  ACTIVITY_FILTER_PARAM_NAMES,
  type ActivityFilters,
  type ActivityStatusFilter,
  type ActivityTypeFilter,
  activityFiltersAreEmpty,
} from '~/features/publishers/model/filter-publisher-activities'
import { type ReportMonthRow, reportStatus } from '~/features/publishers/model/report-month'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { cn } from '~/shared/utils/utils'

import { PublisherGroupFilter } from './PublisherGroupFilter'
import { serviceLabel } from './publisher-type-labels'

const STATUS_OPTIONS: { value: ActivityStatusFilter; label: () => string }[] = [
  { value: 'all', label: () => m.activity_filter_all() },
  { value: 'not-filed', label: () => m.activity_status_missing() },
  { value: 'irregular', label: () => m.activity_filter_not_preached() },
  { value: 'inactive', label: () => m.activity_filter_inactive() },
]

const TYPES = [
  PublisherType.Normal,
  PublisherType.PionnierAuxiliaires,
  PublisherType.PionnierPermanant,
  PublisherType.PionnierSpecial,
  PublisherType.Missionnaire,
]

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

/** Search, the report status with its counts, the service, and the group where the group strip is not shown. */
export function ActivityReportFilters({ filters, rows, groups }: ActivityReportFiltersProps) {
  const [, setSearchParams] = useSearchParams()
  const counts = countByStatus(rows)

  const setParam = (name: string, value: string, fallback: string) =>
    setSearchParams(
      prev => {
        if (value === fallback) prev.delete(name)
        else prev.set(name, value)
        return prev
      },
      { replace: true },
    )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-48 flex-[0_1_15rem]">
        <SearchInput paramName="q" placeholder={m.activity_filters_search_placeholder()} />
      </div>

      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">{m.activity_filter_status_label()}</legend>
        {STATUS_OPTIONS.map(option => {
          const pressed = filters.status === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setParam('status', option.value, 'all')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-sm outline-none transition-colors duration-(--u-duration-fast) focus-visible:ring-2 focus-visible:ring-ring',
                pressed
                  ? 'border-foreground text-foreground'
                  : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
              )}
            >
              {option.label()}
              <span className="text-faint tabular-nums">{counts[option.value]}</span>
            </button>
          )
        })}
      </fieldset>

      <Select value={filters.type} onValueChange={value => setParam('type', value as ActivityTypeFilter, 'all')}>
        <SelectTrigger size="sm" aria-label={m.activity_filters_type_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.activity_filters_type_all()}</SelectItem>
          {TYPES.map(type => (
            <SelectItem key={type} value={type}>
              {serviceLabel(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="lg:hidden">
        <PublisherGroupFilter groups={groups} selectedIds={filters.groupIds} />
      </div>

      {!activityFiltersAreEmpty(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setSearchParams(
              prev => {
                for (const name of ACTIVITY_FILTER_PARAM_NAMES) prev.delete(name)
                return prev
              },
              { replace: true },
            )
          }
        >
          <X />
          {m.activity_filters_clear()}
        </Button>
      )}
    </div>
  )
}
