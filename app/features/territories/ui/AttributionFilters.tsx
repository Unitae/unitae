import { ArrowUpDown, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Form, useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'
import type { SortMode } from '~/shared/utils/pagination.server'
import { cn } from '~/shared/utils/utils'
import SearchInputWithHelp from './SearchInputWithHelp'

interface AttributionFiltersProps {
  action?: string
  phoneTypeActive?: boolean
  groups?: PublisherGroup[]
  showSort?: boolean
  sortValue?: SortMode
  sortOptions?: SortMode[]
}

export default function AttributionFilters({
  action,
  phoneTypeActive = false,
  groups = [],
  showSort = false,
  sortValue,
  sortOptions = ['date'],
}: AttributionFiltersProps) {
  const [params] = useSearchParams()
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const advancedSelects = (
    <>
      <Select name="type" defaultValue={params.get('type') ?? 'none'}>
        <SelectTrigger className="max-sm:flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{m.territories_filter_mode()}</SelectItem>
          <SelectItem value={TerritoryAttributionKind.Default}>
            {phoneTypeActive ? m.territories_filter_default_classic() : m.territories_type_classical_capitalized()}
          </SelectItem>
          {!phoneTypeActive && (
            <SelectItem value={TerritoryAttributionKind.Phone}>{m.territories_type_phone_singular()}</SelectItem>
          )}
          <SelectItem value={TerritoryAttributionKind.Campaign}>{m.attributions_type_campaign()}</SelectItem>
        </SelectContent>
      </Select>
      <Select name="group" defaultValue={params.get('group') ?? 'none'}>
        <SelectTrigger className="max-sm:flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{m.territories_filter_group()}</SelectItem>
          {groups.map(group => (
            <SelectItem value={String(group.id)} key={group.id}>
              {formatGroupName(group.name)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select name="status" defaultValue={params.get('status') ?? 'none'}>
        <SelectTrigger className="max-sm:flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{m.territories_filter_status()}</SelectItem>
          <SelectItem value="current">{m.territories_filter_status_current()}</SelectItem>
          <SelectItem value="late">{m.territories_filter_status_late()}</SelectItem>
          <SelectItem value="orphaned">{m.territories_filter_status_orphaned()}</SelectItem>
        </SelectContent>
      </Select>
    </>
  )

  return (
    <Form className="flex flex-col gap-1.5" action={action}>
      <span className="font-medium text-muted-foreground text-sm">{m.territories_filter_label()}</span>
      <div className="flex flex-wrap gap-2">
        <SearchInputWithHelp defaultValue={params.get('search') ?? undefined} />
        {showSort && (
          <Select name="sort" defaultValue={sortValue}>
            <SelectTrigger className="gap-1.5 max-sm:flex-1">
              <ArrowUpDown className="size-3.5 text-muted-foreground" />
              <SelectValue placeholder={m.territories_filter_sort_label()} />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.includes('date') && <SelectItem value="date">{m.territories_filter_sort_date()}</SelectItem>}
              {sortOptions.includes('number') && (
                <SelectItem value="number">{m.territories_filter_sort_number()}</SelectItem>
              )}
              {sortOptions.includes('proximity') && (
                <SelectItem value="proximity">{m.territories_filter_sort_proximity()}</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-between sm:hidden"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(o => !o)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            {m.territories_filter_advanced()}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')} />
        </Button>

        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <Search className="size-4" />
          {m.territories_filter_submit()}
        </Button>
      </div>

      {/* Render the advanced Selects only ONCE so Radix doesn't inject
          duplicate hidden form inputs. Visible inline on `sm+`; on mobile
          its visibility is toggled by `advancedOpen`. */}
      <div className={cn('flex flex-wrap gap-2 max-sm:flex-col', !advancedOpen && 'max-sm:hidden')}>
        {advancedSelects}
      </div>
    </Form>
  )
}
