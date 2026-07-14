import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { PublisherGroupFilter, type PublisherGroupOption } from '~/features/publishers/ui/PublisherGroupFilter'
import * as m from '~/i18n/paraglide/messages'
import { PublisherType } from '~/shared/types/publisher-type'
import { Button } from '~/shared/ui/button'
import { SearchInput } from '~/shared/ui/SearchInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'

export const PUBLISHER_LIST_FILTER_PARAM_NAMES = ['q', 'group', 'type'] as const

interface PublisherListFiltersProps {
  groups: PublisherGroupOption[]
  selectedGroupIds: number[]
  selectedType: PublisherType | 'all'
  hasActiveFilters: boolean
}

export function PublisherListFilters({
  groups,
  selectedGroupIds,
  selectedType,
  hasActiveFilters,
}: PublisherListFiltersProps) {
  const [, setSearchParams] = useSearchParams()

  const setType = (next: PublisherType | 'all') => {
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
        for (const name of PUBLISHER_LIST_FILTER_PARAM_NAMES) prev.delete(name)
        return prev
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[220px] flex-1">
        <SearchInput paramName="q" placeholder={m.publishers_search_placeholder()} />
      </div>

      <PublisherGroupFilter groups={groups} selectedIds={selectedGroupIds} />

      <Select value={selectedType} onValueChange={value => setType(value as PublisherType | 'all')}>
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
