import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { PublisherGroup } from '~/database/generated/client'
import { DEFAULT_ATTRIBUTION_KINDS, DEFAULT_TERRITORY_KINDS } from '~/features/territories/model/stats-filter-defaults'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'
import StatsFiltersDialog from './StatsFiltersDialog'
import { buildStatsFilterChips, chipToneClassName } from './stats-filter-chips'

interface StatsFilterChipBarProps {
  theocraticYear: number
  groups: PublisherGroup[]
  phoneTypeActive?: boolean
}

export default function StatsFilterChipBar({
  theocraticYear,
  groups,
  phoneTypeActive = false,
}: StatsFilterChipBarProps) {
  const [params] = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)

  // The chip bar is a scope readout for a decision-making page: chips must
  // reflect what the loader actually queried. Resolve missing URL params to
  // the same defaults `parseStatsFilterParams` applies server-side (dates from
  // the current theocratic year, kinds/attributions from the shared defaults).
  const startDate = params.get('startDate') ?? new Date(theocraticYear, 8, 1).toLocaleDateString('en-CA')
  const endDate = params.get('endDate') ?? new Date(theocraticYear + 1, 7, 31).toLocaleDateString('en-CA')
  const rawKinds = params.getAll('kind')
  const kinds = rawKinds.length > 0 ? rawKinds : DEFAULT_TERRITORY_KINDS
  const attributionKinds =
    params.getAll('attributionKind').length > 0 ? params.getAll('attributionKind') : DEFAULT_ATTRIBUTION_KINDS

  const chips = buildStatsFilterChips({
    startDate,
    endDate,
    kinds,
    attributionKinds,
    groupId: params.get('group'),
    groups,
    phoneTypeActive,
  })

  return (
    <>
      <div className="-mx-4 md:-mx-6 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/80 px-4 py-2 backdrop-blur-sm md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(chip => (
            <Badge key={chip.key} variant="outline" className={chipToneClassName[chip.tone]}>
              {chip.label}
            </Badge>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setIsOpen(true)}>
          <SlidersHorizontal className="size-4" />
          {m.stats_filter_modify()}
        </Button>
      </div>
      <StatsFiltersDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        phoneTypeActive={phoneTypeActive}
        groups={groups}
        theocraticYear={theocraticYear}
      />
    </>
  )
}
