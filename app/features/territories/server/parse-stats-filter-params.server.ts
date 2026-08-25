import type { AttributionCategory } from '~/features/territories/model/attribution-category'
import { DEFAULT_ATTRIBUTION_KINDS, DEFAULT_TERRITORY_KINDS } from '~/features/territories/model/stats-filter-defaults'
import type { TerritoryKindKey } from '~/features/territories/model/territory-kind.type'
import { parseLocalDate } from '~/shared/utils/date.server'
import type { StatsFilterParams } from './stats-filter-params.type'
import { getBeginingDateOfTheocraticYear, getEndDateOfTheocraticYear } from './theocratic-year.server'

// Falls back to `fallback` for missing/empty/unparseable input. Centralises the
// guard so the rest of the parser stays linear.
function parseLocalDateOrDefault(value: string | null, fallback: Date): Date {
  if (value == null || value === '') return fallback
  const parsed = parseLocalDate(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function parseStatsFilterParams(params: URLSearchParams, theocraticYear: number): StatsFilterParams {
  const rawKinds = params.getAll('kind')
  const attributionKinds = params.getAll('attributionKind') as AttributionCategory[]

  // `kind=none` is the "Tous types" placeholder option: it means "no kind filter".
  // We distinguish it from the empty (no-param) case which still defaults to Classical.
  const territoryKind = rawKinds.includes('none')
    ? []
    : rawKinds.length > 0
      ? (rawKinds as TerritoryKindKey[])
      : DEFAULT_TERRITORY_KINDS

  let startDate = parseLocalDateOrDefault(params.get('startDate'), getBeginingDateOfTheocraticYear(theocraticYear))
  let endDate = parseLocalDateOrDefault(params.get('endDate'), getEndDateOfTheocraticYear(theocraticYear))
  // Defensive swap: an inverted range silently becomes the corrected range
  // rather than returning zero rows from SQL.
  if (startDate > endDate) {
    ;[startDate, endDate] = [endDate, startDate]
  }

  return {
    territoryKind,
    attributionKind: attributionKinds.length > 0 ? attributionKinds : DEFAULT_ATTRIBUTION_KINDS,
    startDate,
    endDate,
    groupId: params.get('group') != null && params.get('group') !== 'none' ? Number(params.get('group')) : undefined,
  }
}
