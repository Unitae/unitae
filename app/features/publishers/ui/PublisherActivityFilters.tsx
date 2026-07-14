import { ChevronDown, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import {
  ACTIVITY_FILTER_PARAM_NAMES,
  type ActivityFilters,
  type ActivityStatusFilter,
  type ActivityTypeFilter,
  activityFiltersAreEmpty,
} from '~/features/publishers/model/filter-publisher-activities'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { cn } from '~/shared/utils/utils'

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

  const setGroupIds = (next: number[]) => {
    setSearchParams(
      prev => {
        prev.delete('group')
        for (const id of next) prev.append('group', String(id))
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

      <GroupFilter groups={groups} selectedIds={filters.groupIds} onChange={setGroupIds} />

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

interface GroupFilterProps {
  groups: { id: number; name: string }[]
  selectedIds: number[]
  onChange: (next: number[]) => void
}

function GroupFilter({ groups, selectedIds, onChange }: GroupFilterProps) {
  const selected = new Set(selectedIds)

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-normal">
          {m.activity_filters_group_label()}
          {selected.size > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5">
              {selected.size}
            </Badge>
          ) : (
            <span className="text-muted-foreground">{m.activity_filters_group_all()}</span>
          )}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <fieldset
          aria-label={m.activity_filters_group_label()}
          className="flex max-h-64 flex-wrap items-start gap-2 overflow-y-auto p-1"
        >
          {groups.length === 0 && (
            <span className="text-muted-foreground text-xs italic">{m.activity_filters_group_empty()}</span>
          )}
          {groups.map(group => {
            const isSelected = selected.has(group.id)
            return (
              <label
                key={group.id}
                htmlFor={`activity-filter-group-${group.id}`}
                className={cn(
                  'inline-flex w-fit cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 font-medium text-xs transition-colors',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
                  isSelected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <input
                  type="checkbox"
                  id={`activity-filter-group-${group.id}`}
                  value={group.id}
                  checked={isSelected}
                  onChange={() => toggle(group.id)}
                  className="sr-only"
                />
                {group.name}
              </label>
            )
          })}
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}
