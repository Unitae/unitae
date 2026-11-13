import { CalendarDays, ChevronDown } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { DEFAULT_ATTRIBUTION_KINDS, DEFAULT_TERRITORY_KINDS } from '~/features/territories/model/stats-filter-defaults'
import { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { territoryKindLabel } from '~/features/territories/ui/my-territory-labels'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DateInput } from '~/shared/ui/DateInput'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/shared/ui/dropdown-menu'
import { Label } from '~/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '~/shared/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/shared/ui/select'
import { formatGroupName } from '~/shared/utils/format-group-name'

import { periodLabel, readStatsFilters, serviceYearBounds, sortieLabel, sortiesLabel } from './stats-filters'

const FILTER_PARAMS = ['startDate', 'endDate', 'kind', 'attributionKind', 'group'] as const

interface StatsFilterRowProps {
  theocraticYear: number
  groups: PublisherGroup[]
  /** The congregation keeps phone territories: « Téléphone » is a territory kind, not a kind of sortie. */
  phoneTypeActive?: boolean
}

/**
 * The period analysis's filters, in one row above its figures: the period, the territory kind, the kinds of sortie
 * counted and the group; « Réinitialiser » once one moved. Each control changes the address at once.
 */
export function StatsFilterRow({ theocraticYear, groups, phoneTypeActive = false }: StatsFilterRowProps) {
  const [params, setParams] = useSearchParams()
  const filters = readStatsFilters(params, theocraticYear)
  const update = (change: (next: URLSearchParams) => void) =>
    setParams(
      prev => {
        change(prev)
        return prev
      },
      { replace: true, preventScrollReset: true },
    )
  const moved = FILTER_PARAMS.some(param => params.has(param))

  const kinds = [
    TerritoryKindKey.Classical,
    ...(phoneTypeActive ? [TerritoryKindKey.Phone] : []),
    TerritoryKindKey.Commerces,
    TerritoryKindKey.Hotel,
    TerritoryKindKey.Univ,
  ]
  const sorties = [
    AttributionCategory.Default,
    ...(phoneTypeActive ? [] : [AttributionCategory.Phone]),
    AttributionCategory.Campaign,
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PeriodFilter
        startDate={filters.startDate}
        endDate={filters.endDate}
        theocraticYear={theocraticYear}
        onChange={(startDate, endDate) =>
          update(next => {
            next.set('startDate', startDate)
            next.set('endDate', endDate)
          })
        }
      />
      <Select
        value={filters.kind}
        onValueChange={kind =>
          update(next => {
            next.delete('kind')
            // The default kind leaves the address clean.
            if (kind !== DEFAULT_TERRITORY_KINDS[0]) next.set('kind', kind)
          })
        }
      >
        <SelectTrigger aria-label={m.stats_filter_territory_type()} className="max-sm:flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{m.stats_filter_territory_all_types()}</SelectItem>
          {kinds.map(kind => (
            <SelectItem key={kind} value={kind}>
              {territoryKindLabel(kind)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="max-sm:flex-1">
            <span className="truncate">{sortiesLabel(filters.attributionKinds, phoneTypeActive)}</span>
            <ChevronDown className="text-faint" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {sorties.map(kind => {
            const checked = filters.attributionKinds.includes(kind)
            return (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={checked}
                // At least one kind of sortie stays counted.
                disabled={checked && filters.attributionKinds.length === 1}
                onSelect={event => event.preventDefault()}
                onCheckedChange={on =>
                  update(next => {
                    const chosen = on
                      ? [...filters.attributionKinds, kind]
                      : filters.attributionKinds.filter(each => each !== kind)
                    next.delete('attributionKind')
                    const isDefault =
                      chosen.length === DEFAULT_ATTRIBUTION_KINDS.length &&
                      DEFAULT_ATTRIBUTION_KINDS.every(each => chosen.includes(each))
                    if (!isDefault) for (const each of chosen) next.append('attributionKind', each)
                  })
                }
              >
                {sortieLabel(kind, phoneTypeActive)}
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {groups.length > 0 && (
        <Select
          value={filters.group}
          onValueChange={group =>
            update(next => {
              if (group === 'none') next.delete('group')
              else next.set('group', group)
            })
          }
        >
          <SelectTrigger aria-label={m.stats_filter_group_placeholder()} className="max-sm:flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{m.stats_filter_group_all()}</SelectItem>
            {groups.map(group => (
              <SelectItem key={group.id} value={String(group.id)}>
                {formatGroupName(group.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span className="flex-1" />
      {moved && (
        <Button
          variant="ghost"
          onClick={() =>
            update(next => {
              for (const param of FILTER_PARAMS) next.delete(param)
            })
          }
        >
          {m.stats_filter_reset()}
        </Button>
      )}
    </div>
  )
}

/** « Année 2025/2026 · 1 sept. – 31 août »: the two service years at hand, or any two days. */
function PeriodFilter({
  startDate,
  endDate,
  theocraticYear,
  onChange,
}: {
  startDate: string
  endDate: string
  theocraticYear: number
  onChange: (startDate: string, endDate: string) => void
}) {
  const years = [
    { label: m.stats_period_this_year(), ...serviceYearBounds(theocraticYear) },
    { label: m.stats_period_last_year(), ...serviceYearBounds(theocraticYear - 1) },
  ]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={`${m.stats_filter_period_label()} : ${periodLabel(startDate, endDate)}`}>
          <CalendarDays className="text-faint" aria-hidden="true" />
          {periodLabel(startDate, endDate)}
          <ChevronDown className="text-faint" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-1 p-1.5">
        {years.map(year => (
          <button
            key={year.startDate}
            type="button"
            aria-pressed={year.startDate === startDate && year.endDate === endDate}
            onClick={() => onChange(year.startDate, year.endDate)}
            className="flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-selected pointer-coarse:min-h-11"
          >
            {year.label}
            <span className="text-faint tabular-nums">{periodLabel(year.startDate, year.endDate).split(' · ')[0]}</span>
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        {/* Keyed on the period, so choosing a year above shows its days here. */}
        <div key={`${startDate}-${endDate}`} className="grid grid-cols-1 gap-2 px-1 pt-1 pb-1.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stats-from">{m.stats_filter_from()}</Label>
            <DateInput
              id="stats-from"
              defaultValue={startDate}
              max={endDate}
              onChange={next => next && onChange(next, endDate)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stats-to">{m.stats_filter_to()}</Label>
            <DateInput
              id="stats-to"
              defaultValue={endDate}
              min={startDate}
              onChange={next => next && onChange(startDate, next)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
