import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import { parseLocalDate } from '~/shared/utils/date.server'
import type { StatsFilterParams } from './stats-filter-params.type'
import { getBeginingDateOfTheocraticYear, getEndDateOfTheocraticYear } from './theocratic-year.server'

export function parseStatsFilterParams(params: URLSearchParams, theocraticYear: number): StatsFilterParams {
  const rawKinds = params.getAll('kind')
  const attributionKinds = params.getAll('attributionKind') as TerritoryAttributionKind[]

  // `kind=none` is the "Tous types" placeholder option: it means "no kind filter".
  // We distinguish it from the empty (no-param) case which still defaults to Classical.
  const territoryKind = rawKinds.includes('none')
    ? []
    : rawKinds.length > 0
      ? (rawKinds as TerritoryKind[])
      : [TerritoryKind.Classical]

  const startDateParam = params.get('startDate')
  const endDateParam = params.get('endDate')

  return {
    territoryKind,
    attributionKind:
      attributionKinds.length > 0
        ? attributionKinds
        : [TerritoryAttributionKind.Default, TerritoryAttributionKind.Campaign],
    startDate: startDateParam != null ? parseLocalDate(startDateParam) : getBeginingDateOfTheocraticYear(theocraticYear),
    endDate: endDateParam != null ? parseLocalDate(endDateParam) : getEndDateOfTheocraticYear(theocraticYear),
    groupId: params.get('group') != null && params.get('group') !== 'none' ? Number(params.get('group')) : undefined,
  }
}
