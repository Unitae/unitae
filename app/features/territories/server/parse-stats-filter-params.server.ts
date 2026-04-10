import { TerritoryAttributionKind } from '~/features/territories/model/territory-attribution-kind.type'
import { TerritoryKind } from '~/features/territories/model/territory-kind.type'
import type { StatsFilterParams } from './stats-filter-params.type'
import { getBeginingDateOfTheocraticYear, getEndDateOfTheocraticYear } from './theocratic-year.server'

export function parseStatsFilterParams(params: URLSearchParams, theocraticYear: number): StatsFilterParams {
  const kinds = params.getAll('kind') as TerritoryKind[]
  const attributionKinds = params.getAll('attributionKind') as TerritoryAttributionKind[]

  return {
    territoryKind: kinds.length > 0 ? kinds : [TerritoryKind.Classical],
    attributionKind: attributionKinds.length > 0 ? attributionKinds : [TerritoryAttributionKind.Default],
    startDate:
      params.get('startDate') != null
        ? new Date(String(params.get('startDate')))
        : getBeginingDateOfTheocraticYear(theocraticYear),
    endDate:
      params.get('endDate') != null
        ? new Date(String(params.get('endDate')))
        : getEndDateOfTheocraticYear(theocraticYear),
    groupId: params.get('group') != null && params.get('group') !== 'none' ? Number(params.get('group')) : undefined,
  }
}
