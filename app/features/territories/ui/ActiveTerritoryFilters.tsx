import { X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'
import { Button } from '~/shared/ui/button'

export interface ActiveTerritoryFilterChip {
  // URL query parameter this chip clears when X is clicked.
  key: string
  // French label (e.g. "Type", "Recherche") — left side of the colon.
  label: string
  // Human-readable current value (e.g. "Tertiaire", "muguets") — right side.
  value: string
}

interface ActiveTerritoryFiltersProps {
  chips: ActiveTerritoryFilterChip[]
}

/**
 * Renders a row of removable chips above the territory/attribution filter
 * forms, plus a "Tout effacer" link that drops every query parameter (including
 * pagination). Returns `null` when no chips are active so callers can mount it
 * unconditionally.
 */
export default function ActiveTerritoryFilters({ chips }: ActiveTerritoryFiltersProps) {
  const [params] = useSearchParams()
  const location = useLocation()

  if (chips.length === 0) return null

  return (
    <section
      aria-label={m.territories_filter_active_label()}
      aria-live="polite"
      className="flex flex-wrap items-center gap-1.5"
    >
      {chips.map(chip => {
        const next = new URLSearchParams(params)
        next.delete(chip.key)
        next.delete('page')
        const search = next.toString()
        const to = `${location.pathname}${search.length > 0 ? `?${search}` : ''}`

        return (
          <Badge key={chip.key} variant="outline" asChild className="gap-1 py-1 pr-1 pl-2 text-sm">
            <Link
              to={to}
              aria-label={m.territories_filter_chip_remove({ label: chip.label, value: chip.value })}
              title={`${chip.label} : ${chip.value}`}
            >
              <span className="text-muted-foreground">{chip.label} :</span>
              <span className="block max-w-[16ch] truncate sm:max-w-[24ch]">{chip.value}</span>
              <span
                className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-hidden="true"
              >
                <X className="size-3" />
              </span>
            </Link>
          </Badge>
        )
      })}

      <Button asChild variant="ghost" size="sm" className="ml-auto h-7 px-2 text-muted-foreground text-sm">
        <Link to={location.pathname} aria-label={m.territories_filter_clear_all()}>
          {m.territories_filter_clear_all()}
        </Link>
      </Button>
    </section>
  )
}
