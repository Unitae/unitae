import { X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'

import * as m from '~/i18n/paraglide/messages'

export interface FilterChip {
  /** URL query parameter the chip's X clears. */
  key: string
  label: string
  value: string
}

interface FilterChipBarProps {
  chips: FilterChip[]
  /**
   * What « Tout effacer » drops: these parameters only, so the search, the view and the order stay. Without it,
   * every query parameter goes.
   */
  clearParams?: readonly string[]
}

/** Builds the address without some parameters (and without the page, which no longer means anything). */
function without(pathname: string, params: URLSearchParams, keys: readonly string[] | null): string {
  if (keys == null) return pathname
  const next = new URLSearchParams(params)
  for (const key of keys) next.delete(key)
  next.delete('page')
  const search = next.toString()
  return `${pathname}${search.length > 0 ? `?${search}` : ''}`
}

/**
 * The active filters under a list's toolbar, one chip each, « Groupe : Nord », and « Tout effacer ». Only the
 * chip's × removes its filter, so a click on the label never drops one by mistake. Nothing shows without a filter.
 */
export function FilterChipBar({ chips, clearParams }: FilterChipBarProps) {
  const [params] = useSearchParams()
  const location = useLocation()

  if (chips.length === 0) return null

  return (
    <section aria-label={m.filters_active_label()} aria-live="polite" className="flex flex-wrap items-center gap-1.5">
      {chips.map(chip => (
        <span
          key={chip.key}
          title={`${chip.label} : ${chip.value}`}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card pr-0.5 pl-2.5 text-sm"
        >
          <span className="text-muted-foreground">{chip.label} :</span>
          <span className="block max-w-[16ch] truncate sm:max-w-[24ch]">{chip.value}</span>
          <Link
            to={without(location.pathname, params, [chip.key])}
            replace
            preventScrollReset
            aria-label={m.filters_chip_remove({ label: chip.label, value: chip.value })}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </Link>
        </span>
      ))}
      <Link
        to={without(location.pathname, params, clearParams ?? null)}
        replace
        preventScrollReset
        className="inline-flex h-7 items-center rounded-full px-2.5 text-muted-foreground text-sm outline-none transition-colors duration-(--u-duration-fast) hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {m.filters_clear_all()}
      </Link>
    </section>
  )
}
