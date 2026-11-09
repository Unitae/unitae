import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'

import type { PioneerFilters } from '~/features/publishers/model/pioneer-filters'
import { pioneerFiltersAreEmpty } from '~/features/publishers/model/pioneer-filters'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'
import { cn } from '~/shared/utils/utils'

const RISK_OPTIONS: { value: PioneerFilters['risk']; label: () => string }[] = [
  { value: 'all', label: () => m.activity_filter_all() },
  { value: 'red', label: () => m.pioneers_risk_red() },
  { value: 'amber', label: () => m.pioneers_risk_amber() },
  { value: 'green', label: () => m.pioneers_status_on_time() },
]

interface Props {
  filters: PioneerFilters
  groups: string[]
  /** Annual pioneers per pace, before filtering. */
  counts: Record<PioneerFilters['risk'], number>
}

/** Search, the pace with its counts, the service and the group. */
export function PioneerRosterFilters({ filters, groups, counts }: Props) {
  const [params, setParams] = useSearchParams()

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value === 'all' || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { preventScrollReset: true })
  }

  const clearAll = () => {
    const next = new URLSearchParams(params)
    for (const key of ['q', 'risk', 'type', 'group']) next.delete(key)
    setParams(next, { preventScrollReset: true })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-48 flex-[0_1_15rem]">
        <SearchInput paramName="q" placeholder={m.pioneers_filters_search_placeholder()} />
      </div>

      <fieldset className="flex flex-wrap gap-1">
        <legend className="sr-only">{m.pioneers_filters_risk_label()}</legend>
        {RISK_OPTIONS.map(option => {
          const pressed = filters.risk === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setParam('risk', option.value)}
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

      <Select value={filters.type} onValueChange={value => setParam('type', value)}>
        <SelectTrigger size="sm" aria-label={m.pioneers_filters_type_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.pioneers_filters_type_all()}</SelectItem>
          <SelectItem value={PublisherType.PionnierPermanant}>{m.pioneers_type_permanent()}</SelectItem>
          <SelectItem value={PublisherType.PionnierAuxiliaires}>{m.pioneers_type_auxiliary()}</SelectItem>
          <SelectItem value={PublisherType.PionnierSpecial}>{m.pioneers_type_special()}</SelectItem>
          <SelectItem value={PublisherType.Missionnaire}>{m.pioneers_type_missionary()}</SelectItem>
        </SelectContent>
      </Select>

      {groups.length > 0 && (
        <Select value={filters.group} onValueChange={value => setParam('group', value)}>
          <SelectTrigger size="sm" aria-label={m.pioneers_filters_group_label()}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{m.pioneers_filters_group_all()}</SelectItem>
            {groups.map(group => (
              <SelectItem key={group} value={group}>
                {formatGroupName(group)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!pioneerFiltersAreEmpty(filters) && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <X className="size-3.5" />
          {m.pioneers_filters_clear()}
        </Button>
      )}
    </div>
  )
}
