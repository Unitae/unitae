import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import {
  ACTIVITY_FILTER_PARAM_NAMES,
  type ActivityFilters,
  type ActivityStatusFilter,
  type ActivityTypeFilter,
  activityFiltersAreEmpty,
} from '~/features/publishers/model/filter-publisher-activities'
import { PublisherGroupFilter } from '~/features/publishers/ui/PublisherGroupFilter'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

interface PublisherActivityFiltersProps {
  filters: ActivityFilters
  groups: { id: number; name: string }[]
}

export function PublisherActivityFilters({ filters, groups }: PublisherActivityFiltersProps) {
  const [, setSearchParams] = useSearchParams()

  const setStatus = (next: ActivityStatusFilter) => {
    setSearchParams(
      prev => {
        if (next === 'all') prev.delete('status')
        else prev.set('status', next)
        return prev
      },
      { replace: true },
    )
  }

  const setType = (next: ActivityTypeFilter) => {
    setSearchParams(
      prev => {
        if (next === 'all') prev.delete('type')
        else prev.set('type', next)
        return prev
      },
      { replace: true },
    )
  }

  const clearAll = () => {
    setSearchParams(
      prev => {
        for (const name of ACTIVITY_FILTER_PARAM_NAMES) prev.delete(name)
        return prev
      },
      { replace: true },
    )
  }

  const hasActiveFilters = !activityFiltersAreEmpty(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[220px] flex-1">
        <SearchInput paramName="q" placeholder={m.activity_filters_search_placeholder()} />
      </div>

      <PublisherGroupFilter groups={groups} selectedIds={filters.groupIds} />

      <Select value={filters.status} onValueChange={value => setStatus(value as ActivityStatusFilter)}>
        <SelectTrigger aria-label={m.activity_filters_status_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.activity_filters_status_all()}</SelectItem>
          <SelectItem value="filed">{m.activity_filters_status_filed()}</SelectItem>
          <SelectItem value="not-filed">{m.activity_filters_status_not_filed()}</SelectItem>
          <SelectItem value="irregular">{m.activity_filters_status_irregular()}</SelectItem>
          <SelectItem value="inactive">{m.activity_filters_status_inactive()}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.type} onValueChange={value => setType(value as ActivityTypeFilter)}>
        <SelectTrigger aria-label={m.activity_filters_type_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.activity_filters_type_all()}</SelectItem>
          <SelectItem value={PublisherType.Normal}>{m.activity_filters_type_normal()}</SelectItem>
          <SelectItem value={PublisherType.PionnierAuxiliaires}>
            {m.activity_filters_type_auxiliary_pioneer()}
          </SelectItem>
          <SelectItem value={PublisherType.PionnierPermanant}>{m.activity_filters_type_regular_pioneer()}</SelectItem>
          <SelectItem value={PublisherType.PionnierSpecial}>{m.activity_filters_type_special_pioneer()}</SelectItem>
          <SelectItem value={PublisherType.Missionnaire}>{m.activity_filters_type_missionary()}</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5" />
          {m.activity_filters_clear()}
        </Button>
      )}
    </div>
  )
}
