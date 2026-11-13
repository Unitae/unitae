import { AttributionCategory } from '~/features/territories/model/attribution-category'
import { DEFAULT_ATTRIBUTION_KINDS, DEFAULT_TERRITORY_KINDS } from '~/features/territories/model/stats-filter-defaults'
import * as m from '~/i18n/paraglide/messages'
import { getLocale } from '~/i18n/paraglide/runtime'
import { formatDay } from '~/shared/utils/format-day'

/** The filters of the period analysis, as the address holds them; missing ones are the server's defaults. */
export interface StatsFilters {
  startDate: string
  endDate: string
  /** One territory kind, or `none` for « Tous les types ». */
  kind: string
  attributionKinds: string[]
  /** A group's id, or `none` for every group. */
  group: string
}

/** The service year that starts on 1 September of `year`. */
export const serviceYearBounds = (year: number) => ({ startDate: `${year}-09-01`, endDate: `${year + 1}-08-31` })

/** The filters from the address, filled in with what `parseStatsFilterParams` applies when they are missing. */
export function readStatsFilters(params: URLSearchParams, theocraticYear: number): StatsFilters {
  const year = serviceYearBounds(theocraticYear)
  const kinds = params.getAll('kind')
  const attributionKinds = params.getAll('attributionKind')
  return {
    startDate: params.get('startDate') ?? year.startDate,
    endDate: params.get('endDate') ?? year.endDate,
    kind: kinds.includes('none') ? 'none' : (kinds[0] ?? DEFAULT_TERRITORY_KINDS[0]),
    attributionKinds: attributionKinds.length > 0 ? attributionKinds : [...DEFAULT_ATTRIBUTION_KINDS],
    group: params.get('group') ?? 'none',
  }
}

/** « Année 2025/2026 · 1 sept. – 31 août » for a whole service year, « 1 janv. 2026 – 31 mars 2026 » otherwise. */
export function periodLabel(startDate: string, endDate: string): string {
  const year = Number(startDate.slice(0, 4))
  const bounds = serviceYearBounds(year)
  if (startDate === bounds.startDate && endDate === bounds.endDate) {
    const days = `${formatDay(startDate, { day: 'numeric', month: 'short' })} – ${formatDay(endDate, { day: 'numeric', month: 'short' })}`
    return `${m.stats_period_service_year({ start: String(year), end: String(year + 1) })} · ${days}`
  }
  const day = { day: 'numeric', month: 'short', year: 'numeric' } as const
  return `${formatDay(startDate, day)} – ${formatDay(endDate, day)}`
}

/** One kind of sortie, as it reads after « Sorties : ». */
export function sortieLabel(kind: string, phoneTypeActive: boolean): string {
  if (kind === AttributionCategory.Campaign) return m.stats_sortie_campaign()
  if (kind === AttributionCategory.Phone) return m.stats_sortie_phone()
  return phoneTypeActive ? m.stats_sortie_classic() : m.stats_sortie_door()
}

/** « Sorties : porte à porte, campagne ». */
export function sortiesLabel(kinds: readonly string[], phoneTypeActive: boolean): string {
  const list = kinds.map(kind => sortieLabel(kind, phoneTypeActive)).join(', ')
  return m.stats_filter_sorties({ kinds: list.toLocaleLowerCase(getLocale()) })
}
