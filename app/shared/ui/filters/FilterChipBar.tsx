import { X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'
import { Badge } from '~/shared/ui/badge'

export interface FilterChip {
  /** URL query parameter the chip's X clears. */
  key: string
  label: string
  value: string
}

interface FilterChipBarProps {
  chips: FilterChip[]
}

/**
 * Row of removable chips summarising the active URL filters, plus a
 * "Tout effacer" link that drops every query parameter (including
 * pagination). Returns `null` when no chips are active so callers can mount
 * it unconditionally above their filter form.
 *
 * The chip body is inert — only the trailing X removes the filter — so users
 * can't accidentally drop a filter by clicking the label/value.
 */
export function FilterChipBar({ chips }: FilterChipBarProps) {
  const [params] = useSearchParams()
  const location = useLocation()

  if (chips.length === 0) return null

  return (
    <section aria-label={m.filters_active_label()} aria-live="polite" className="flex flex-wrap items-center gap-1.5">
      {chips.map(chip => {
        const next = new URLSearchParams(params)
        next.delete(chip.key)
        next.delete('page')
        const search = next.toString()
        const to = `${location.pathname}${search.length > 0 ? `?${search}` : ''}`

        return (
          <Badge
            key={chip.key}
            variant="outline"
            className="h-7 gap-1 py-0 pr-0.5 pl-2 text-sm"
            title={`${chip.label} : ${chip.value}`}
          >
            <span className="text-muted-foreground">{chip.label} :</span>
            <span className="block max-w-[16ch] truncate sm:max-w-[24ch]">{chip.value}</span>
            <Link
              to={to}
              aria-label={m.filters_chip_remove({ label: chip.label, value: chip.value })}
              className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Link>
          </Badge>
        )
      })}

      <Badge variant="outline" className="h-7 gap-1 py-0 pr-2 pl-2 text-muted-foreground text-sm" asChild>
        <Link
          to={location.pathname}
          aria-label={m.filters_clear_all()}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-3.5" aria-hidden="true" />
          {m.filters_clear_all()}
        </Link>
      </Badge>
    </section>
  )
}
