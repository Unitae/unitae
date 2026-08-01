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

interface Props {
  filters: PioneerFilters
  groups: string[]
}

export function PioneerRosterFilters({ filters, groups }: Props) {
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
      <div className="min-w-[200px] flex-1">
        <SearchInput paramName="q" placeholder={m.pioneers_filters_search_placeholder()} />
      </div>

      <Select value={filters.risk} onValueChange={value => setParam('risk', value)}>
        <SelectTrigger aria-label={m.pioneers_filters_risk_label()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{m.pioneers_filters_risk_all()}</SelectItem>
          <SelectItem value="red">{m.pioneers_risk_red()}</SelectItem>
          <SelectItem value="amber">{m.pioneers_risk_amber()}</SelectItem>
          <SelectItem value="green">{m.pioneers_risk_green()}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.type} onValueChange={value => setParam('type', value)}>
        <SelectTrigger aria-label={m.pioneers_filters_type_label()}>
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
          <SelectTrigger aria-label={m.pioneers_filters_group_label()}>
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
